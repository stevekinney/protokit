import { logger } from '@template/mcp/logger';
import { handleApplicationRequest } from '@web/application';
import { environment } from '@web/env';

const port = environment.PORT;

const staticHeaders = {
	'X-Content-Type-Options': 'nosniff',
};

const staticRoutes: Record<string, Response> = {};

const publicDirectoryUrls = [
	new URL('./public/', import.meta.url),
	new URL('../public/', import.meta.url),
];

async function resolvePublicFile(
	relativePath: string,
): Promise<ReturnType<typeof Bun.file> | null> {
	for (const publicDirectoryUrl of publicDirectoryUrls) {
		const file = Bun.file(new URL(relativePath, publicDirectoryUrl));
		if (await file.exists()) return file;
	}
	return null;
}

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

Bun.serve({
	port,
	static: staticRoutes,
	fetch(request, server) {
		const requestIpAddress = server.requestIP(request)?.address;
		return handleApplicationRequest(request, { clientAddress: requestIpAddress });
	},
});

logger.info({ port }, 'Web server started');
