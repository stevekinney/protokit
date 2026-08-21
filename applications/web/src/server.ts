import { basename } from 'node:path';
import { logger } from '@template/mcp/logger';
import { handleApplicationRequest } from '@web/application';
import { environment } from '@web/env';
import { loadAssetManifest } from '@web/lib/asset-manifest';
import { shutdownMcpTransports } from '@web/lib/mcp-handler';
import { isRedisConfigured, getRedisClient } from '@web/lib/redis-client';
import { mcpRequestMaxBodyBytes } from '@web/lib/request-limits';
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
const hostname = environment.NODE_ENV === 'production' ? undefined : '127.0.0.1';

const server = Bun.serve({
	port,
	hostname,
	static: staticRoutes,
	maxRequestBodySize: globalMaxRequestBodyBytes,
	fetch(request, bunServer) {
		const requestIpAddress = bunServer.requestIP(request)?.address;
		return handleApplicationRequest(request, { clientAddress: requestIpAddress });
	},
});

logger.info({ port, listenHostname: hostname ?? '0.0.0.0' }, 'Web server started');

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
	if (isShuttingDown) return;
	isShuttingDown = true;

	logger.info({ signal }, 'Graceful shutdown initiated');

	server.stop(false);

	const shutdownTimeout = setTimeout(() => {
		logger.warn('Graceful shutdown timed out, forcing exit');
		process.exit(1);
	}, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

	try {
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
