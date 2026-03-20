import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUserProfileTool } from './tools/get-user-profile.js';
import { listAuditEventsTool } from './tools/list-audit-events.js';
import { userProfileResource } from './resources/user-profile.js';
import { summarizePrompt } from './prompts/summarize.js';
import instructions from './instructions.md';
import { EXTENSION_ID } from '@modelcontextprotocol/ext-apps/server';
import { registerConformanceFixtures } from './conformance-fixture-registration.js';
import { environment } from './env.js';

const oauthClientCredentialsExtensionIdentifier =
	'io.modelcontextprotocol/oauth-client-credentials';
const enterpriseAuthorizationExtensionIdentifier =
	'io.modelcontextprotocol/enterprise-managed-authorization';

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
		experimentalCapabilities[EXTENSION_ID] = { version: '1.0.0' };
	}
	if (context.enableClientCredentialsExtension) {
		experimentalCapabilities[oauthClientCredentialsExtensionIdentifier] = { version: '1.0.0' };
	}
	if (context.enableEnterpriseAuthorizationExtension) {
		experimentalCapabilities[enterpriseAuthorizationExtensionIdentifier] = { version: '1.0.0' };
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
				// Resource subscriptions require a persistent connection and server-side change
				// detection (e.g., polling or database triggers). Enable by setting subscribe: true
				// and implementing notification logic in each resource handler.
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
