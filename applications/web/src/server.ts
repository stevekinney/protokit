import { logger } from '@template/mcp/logger';
import { handleApplicationRequest } from '@web/application';

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
	port,
	fetch(request, server) {
		const requestIpAddress = server.requestIP(request)?.address;
		return handleApplicationRequest(request, { clientAddress: requestIpAddress });
	},
});

logger.info({ port }, 'Web server started');
