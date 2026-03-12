import { logger } from '@template/mcp/logger';
import { handleApplicationRequest } from '@web/application';
import { environment } from '@web/env';

const port = environment.PORT;

Bun.serve({
	port,
	fetch(request, server) {
		const requestIpAddress = server.requestIP(request)?.address;
		return handleApplicationRequest(request, { clientAddress: requestIpAddress });
	},
});

logger.info({ port }, 'Web server started');
