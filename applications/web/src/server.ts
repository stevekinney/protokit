import { logger } from '@template/mcp/logger';
import { handleApplicationRequest } from '@web/application';
import { environment } from '@web/env';

const port = environment.PORT;

const staticHeaders = {
	'X-Content-Type-Options': 'nosniff',
};

const staticRoutes: Record<string, Response> = {};

const faviconFile = Bun.file('public/favicon.png');
if (await faviconFile.exists()) {
	staticRoutes['/favicon.png'] = new Response(faviconFile, {
		headers: {
			...staticHeaders,
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=86400',
		},
	});
}

const stylesheetFile = Bun.file('public/assets/application.css');
if (await stylesheetFile.exists()) {
	staticRoutes['/assets/application.css'] = new Response(stylesheetFile, {
		headers: {
			...staticHeaders,
			'Content-Type': 'text/css',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
}

Bun.serve({
	port,
	static: staticRoutes,
	fetch(request, server) {
		const requestIpAddress = server.requestIP(request)?.address;
		return handleApplicationRequest(request, { clientAddress: requestIpAddress });
	},
});

logger.info({ port }, 'Web server started');
