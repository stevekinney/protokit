import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUserProfileTool } from './tools/get-user-profile.js';
import { renderAccountDashboardTool } from './tools/render-account-dashboard.js';
import { listAuditEventsTool } from './tools/list-audit-events.js';
import { userProfileResource } from './resources/user-profile.js';
import { accountDashboardApplicationResource } from './resources/account-dashboard-application.js';
import { summarizePrompt } from './prompts/summarize.js';
import instructions from './instructions.md';
import {
	mcpUiExtensionIdentifier,
	mcpOauthClientCredentialsExtensionIdentifier,
	mcpEnterpriseAuthorizationExtensionIdentifier,
} from './protocol-extensions.js';
import { registerConformanceFixtures } from './conformance-fixture-registration.js';
import { environment } from './env.js';

export function createMcpServer(context: {
	userId: string;
	enableUiExtension: boolean;
	enableClientCredentialsExtension: boolean;
	enableEnterpriseAuthorizationExtension: boolean;
	enableConformanceMode?: boolean;
}): McpServer {
	const enableConformanceMode = context.enableConformanceMode ?? environment.MCP_CONFORMANCE_MODE;
	const experimentalCapabilities: Record<string, object> = {};
	if (context.enableUiExtension) {
		experimentalCapabilities[mcpUiExtensionIdentifier] = { version: '1.0.0' };
	}
	if (context.enableClientCredentialsExtension) {
		experimentalCapabilities[mcpOauthClientCredentialsExtensionIdentifier] = { version: '1.0.0' };
	}
	if (context.enableEnterpriseAuthorizationExtension) {
		experimentalCapabilities[mcpEnterpriseAuthorizationExtensionIdentifier] = { version: '1.0.0' };
	}

	const server = new McpServer(
		{
			name: 'template-mcp-server',
			version: '0.1.0',
		},
		{
			instructions,
			capabilities: {
				logging: {},
				tools: { listChanged: true },
				resources: { listChanged: true, subscribe: false },
				prompts: { listChanged: true },
				...(enableConformanceMode ? { sampling: {}, elicitation: {} } : {}),
				experimental: experimentalCapabilities,
			},
		},
	);

	server.registerTool(
		getUserProfileTool.name,
		{
			description: getUserProfileTool.description,
			inputSchema: getUserProfileTool.inputSchema,
		},
		async () => getUserProfileTool.handler({}, context),
	);

	server.registerTool(
		renderAccountDashboardTool.name,
		{
			description: renderAccountDashboardTool.description,
			inputSchema: renderAccountDashboardTool.inputSchema,
			_meta: {
				'io.modelcontextprotocol/ui': {
					resource: 'ui://account-dashboard',
				},
			},
		},
		async (input, extra) => renderAccountDashboardTool.handler(input, context, extra),
	);

	server.registerTool(
		listAuditEventsTool.name,
		{
			description: listAuditEventsTool.description,
			inputSchema: listAuditEventsTool.inputSchema,
		},
		async (input) => listAuditEventsTool.handler(input),
	);

	server.registerResource(
		userProfileResource.name,
		userProfileResource.uri,
		{ description: userProfileResource.description, mimeType: userProfileResource.mimeType },
		async (uri) => userProfileResource.handler(uri, context),
	);

	server.registerResource(
		accountDashboardApplicationResource.name,
		accountDashboardApplicationResource.uri,
		{
			description: accountDashboardApplicationResource.description,
			mimeType: accountDashboardApplicationResource.mimeType,
		},
		async (uri) => accountDashboardApplicationResource.handler(uri, context),
	);

	server.registerPrompt(
		summarizePrompt.name,
		{ description: summarizePrompt.description, argsSchema: summarizePrompt.arguments },
		async (arguments_) => summarizePrompt.handler(arguments_, context),
	);

	if (enableConformanceMode) {
		registerConformanceFixtures(server);
	}

	return server;
}
