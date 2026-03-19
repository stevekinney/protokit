import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { logger } from '../logger.js';
import dashboardHtml from '@template/mcp-apps/account-dashboard';

export const accountDashboardApplicationResource = {
	name: 'account_dashboard_application' as const,
	uri: 'ui://account-dashboard',
	description: 'UI resource for account dashboard rendering in MCP App-compatible hosts.',
	mimeType: RESOURCE_MIME_TYPE,
	handler: async (uri: URL, context: { userId: string }) => {
		const requestLogger = logger.child({
			resource: 'account_dashboard_application',
			userId: context.userId,
		});
		requestLogger.info({ uri: uri.href }, 'Resource read completed');

		return {
			contents: [
				{
					uri: uri.href,
					mimeType: RESOURCE_MIME_TYPE,
					text: dashboardHtml,
					_meta: {
						'io.modelcontextprotocol/ui': {
							csp: {
								'default-src': ["'none'"],
								'script-src': ["'unsafe-inline'"],
								'style-src': ["'unsafe-inline'"],
							},
							permissions: [],
						},
					},
				},
			],
		};
	},
};
