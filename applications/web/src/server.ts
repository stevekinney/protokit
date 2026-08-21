import { basename } from 'node:path';
import { logger } from '@template/mcp/logger';
import { handleApplicationRequest } from '@web/application';
import { environment } from '@web/env';
import { loadAssetManifest } from '@web/lib/asset-manifest';
import { createInFlightRequestTracker } from '@web/lib/in-flight-request-tracker';
import { shutdownMcpTransports } from '@web/lib/mcp-handler';
import { isRedisConfigured, getRedisClient } from '@web/lib/redis-client';
import { mcpRequestMaxBodyBytes } from '@web/lib/request-limits';
import { startScheduledCleanup, stopScheduledCleanup } from '@web/lib/scheduled-cleanup';
import { describeBindAddress, resolveBindAddress } from '@web/lib/resolve-bind-address';
import { assertProductionStartupInvariants } from '@web/lib/startup-invariants';
import { resolvePublicFile } from '@web/resolve-public-file';

assertProductionStartupInvariants();

const port = environment.PORT;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;

const manifest = await loadAssetManifest();

const staticFileEntries = [
	{ urlPath: '/favicon.png', filePath: 'favicon.png', cacheControl: 'public, max-age=86400' },
	{ urlPath: '/robots.txt', filePath: 'robots.txt', cacheControl: 'public, max-age=86400' },
	{
		urlPath: manifest.stylesheetPath,
		filePath: `assets/${basename(manifest.stylesheetPath)}`,
		cacheControl: 'public, max-age=31536000, immutable',
	},
	{
		urlPath: manifest.clientBundlePath,
		filePath: `assets/${basename(manifest.clientBundlePath)}`,
		cacheControl: 'public, max-age=31536000, immutable',
	},
	{
		urlPath: manifest.clientSourceMapPath,
		filePath: `assets/${basename(manifest.clientSourceMapPath)}`,
		cacheControl: 'public, max-age=31536000, immutable',
	},
];

const staticRoutes: Record<string, Response> = {};
for (const entry of staticFileEntries) {
	const file = await resolvePublicFile(entry.filePath);
	if (file) {
		staticRoutes[entry.urlPath] = new Response(file, {
			headers: {
				'Content-Type': file.type,
				'Cache-Control': entry.cacheControl,
				'X-Content-Type-Options': 'nosniff',
			},
		});
	}
}

// S-05 defense in depth: every route already enforces its own byte limit
// while *reading* the body (see `request-limits.ts`), but this caps what
// Bun will buffer for any request at all, including a route this template
// adds later and forgets to bound individually. Set just above the largest
// per-route limit (`/mcp`'s) rather than at it, so the route-specific limit
// is always what actually rejects a request in normal operation.
const globalMaxRequestBodyBytes = mcpRequestMaxBodyBytes * 2;

// CONFIG-001: bind to loopback outside production so a forgotten NODE_ENV
// (or a plain `bun turbo dev`) is never reachable from the LAN by default.
// `assertProductionStartupInvariants()` above already refuses to start a
// production process with an insecure or missing BASE_URL, so there is
// nothing left to warn about here.
//
// DEPLOY-001: that default is correct on a developer machine and wrong inside a
// container, where loopback binding makes a published port unreachable. The
// address is therefore configurable rather than inferred from NODE_ENV alone —
// the restrictive default is unchanged, but widening it is now a deliberate act.
const hostname = resolveBindAddress({
	nodeEnvironment: environment.NODE_ENV,
	configuredBindAddress: environment.SERVER_BIND_ADDRESS,
});

// `OPS-001`: `Bun.serve(...).stop(false)` (below) stops accepting new
// connections but returns immediately -- it does not wait for a request
// already in `fetch` to finish. Wrapping every dynamically-handled request
// (never the pre-built `static` responses, which do no async work worth
// draining) lets `gracefulShutdown` know when it is actually safe to close
// the MCP transports those in-flight requests may still be using.
const inFlightRequests = createInFlightRequestTracker();

// `OPS-001`: found empirically, not assumed -- Bun.serve's own default
// `idleTimeout` is 10 seconds, but the MCP SDK's `subscriptions/listen`
// stream (`@modelcontextprotocol/server`'s `DEFAULT_SSE_KEEP_ALIVE_MS`)
// only writes a keep-alive comment frame every 15 seconds. Left at Bun's
// default, this server killed its own long-lived SSE responses with
// "request timed out after 10 seconds" before the SDK's own keep-alive
// ever had a chance to prevent that -- independent of anything a reverse
// proxy in front of this server might also do. Set comfortably above the
// SDK's keep-alive interval so this server's own idle timeout is never
// the first thing to close a stream the SDK is actively keeping alive.
const mcpStreamIdleTimeoutSeconds = 60;

const server = Bun.serve({
	port,
	hostname,
	static: staticRoutes,
	maxRequestBodySize: globalMaxRequestBodyBytes,
	idleTimeout: mcpStreamIdleTimeoutSeconds,
	fetch(request, bunServer) {
		const requestIpAddress = bunServer.requestIP(request)?.address;
		return inFlightRequests.track(() =>
			handleApplicationRequest(request, { clientAddress: requestIpAddress }),
		);
	},
});

logger.info({ port, listenHostname: describeBindAddress(hostname) }, 'Web server started');

// DATA-001 / S-18: cleanup is now a scheduled, in-process sweep instead of
// an unscheduled script nothing ever invokes. `scripts/cleanup-expired-data.ts`
// still exists for a manual or externally-cron-scheduled run against a
// deployment that does not keep this process alive (e.g. a one-shot job),
// calling the same `runScheduledCleanup` this interval does.
startScheduledCleanup(environment.SCHEDULED_CLEANUP_INTERVAL_SECONDS * 1000);

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
	if (isShuttingDown) return;
	isShuttingDown = true;

	logger.info({ signal }, 'Graceful shutdown initiated');

	stopScheduledCleanup();
	server.stop(false);

	const shutdownDeadline = Date.now() + GRACEFUL_SHUTDOWN_TIMEOUT_MS;
	const shutdownTimeout = setTimeout(() => {
		logger.warn('Graceful shutdown timed out, forcing exit');
		process.exit(1);
	}, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

	try {
		// Wait for whatever `fetch` was already handling when the signal
		// arrived to actually finish -- closing MCP transports out from
		// under a response still being written turns a real result into a
		// dropped connection, not a clean completion or cancellation.
		const drainBudgetMs = Math.max(0, shutdownDeadline - Date.now());
		const drainResult = await inFlightRequests.drain(drainBudgetMs);
		if (!drainResult.drained) {
			logger.warn(
				{ remaining: drainResult.remaining },
				'Graceful shutdown drain budget exhausted with requests still in flight; closing transports anyway',
			);
		} else {
			logger.info('All in-flight requests finished');
		}

		await shutdownMcpTransports();
		logger.info('All MCP transports closed');

		if (isRedisConfigured()) {
			try {
				const redisClient = await getRedisClient();
				await redisClient.quit();
				logger.info('Redis connection closed');
			} catch {
				// Redis may already be disconnected
			}
		}
	} finally {
		clearTimeout(shutdownTimeout);
	}

	logger.info('Graceful shutdown complete');
	process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
	logger.fatal({ err: error }, 'Uncaught exception');
	void gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
	logger.fatal({ err: reason }, 'Unhandled promise rejection');
	void gracefulShutdown('unhandledRejection');
});
