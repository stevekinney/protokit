import { logger } from '@template/mcp/logger';
import { handleApplicationRequest } from '@web/application';
import { environment } from '@web/env';
import { shutdownMcpTransports } from '@web/lib/mcp-handler';
import { getRedisClient } from '@web/lib/redis-client';
import { resolvePublicFile } from '@web/resolve-public-file';

const port = environment.PORT;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;

const staticHeaders = {
	'X-Content-Type-Options': 'nosniff',
};

const staticRoutes: Record<string, Response> = {};

const faviconFile = await resolvePublicFile('favicon.png');
if (faviconFile) {
	staticRoutes['/favicon.png'] = new Response(faviconFile, {
		headers: {
			...staticHeaders,
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=86400',
		},
	});
}

const stylesheetFile = await resolvePublicFile('assets/application.css');
if (stylesheetFile) {
	staticRoutes['/assets/application.css'] = new Response(stylesheetFile, {
		headers: {
			...staticHeaders,
			'Content-Type': 'text/css',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
}

const robotsFile = await resolvePublicFile('robots.txt');
if (robotsFile) {
	staticRoutes['/robots.txt'] = new Response(robotsFile, {
		headers: {
			...staticHeaders,
			'Content-Type': 'text/plain',
			'Cache-Control': 'public, max-age=86400',
		},
	});
}

const server = Bun.serve({
	port,
	static: staticRoutes,
	fetch(request, bunServer) {
		const requestIpAddress = bunServer.requestIP(request)?.address;
		return handleApplicationRequest(request, { clientAddress: requestIpAddress });
	},
});

logger.info({ port }, 'Web server started');

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

		try {
			const redisClient = await getRedisClient();
			await redisClient.quit();
			logger.info('Redis connection closed');
		} catch {
			// Redis may already be disconnected
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
