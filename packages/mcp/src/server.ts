import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
	SubscribeRequestSchema,
	UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getUserProfileTool } from './tools/get-user-profile.js';
import { listAuditEventsTool } from './tools/list-audit-events.js';
import { userProfileResource } from './resources/user-profile.js';
import { summarizePrompt } from './prompts/summarize.js';
import instructions from './instructions.md';
import { EXTENSION_ID } from '@modelcontextprotocol/ext-apps/server';
import { registerConformanceFixtures } from './conformance-fixture-registration.js';
import { environment } from './env.js';
import { metricsCollector } from './metrics.js';
import type { ResourceSubscriptionBackend } from './resource-subscription-backend.js';

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
	subscriptionBackend?: ResourceSubscriptionBackend;
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
				resources: { listChanged: true, subscribe: true },
				prompts: { listChanged: true },
				...{ sampling: {}, elicitation: {} },
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
		async () => {
			const start = Date.now();
			const result = await getUserProfileTool.handler({}, context);
			metricsCollector.recordToolInvocation(
				getUserProfileTool.name,
				Date.now() - start,
				'isError' in result && result.isError === true,
			);
			return result;
		},
	);

	server.registerTool(
		listAuditEventsTool.name,
		{
			description: listAuditEventsTool.description,
			inputSchema: listAuditEventsTool.inputSchema,
		},
		async (input) => {
			const start = Date.now();
			const result = await listAuditEventsTool.handler(input);
			metricsCollector.recordToolInvocation(
				listAuditEventsTool.name,
				Date.now() - start,
				'isError' in result && result.isError === true,
			);
			return result;
		},
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

	if (context.subscriptionBackend) {
		const backend = context.subscriptionBackend;
		server.server.setRequestHandler(SubscribeRequestSchema, async (request, extra) => {
			const sessionIdentifier = extra.sessionId ?? 'stateless';
			await backend.subscribe(sessionIdentifier, request.params.uri);
			return {};
		});
		server.server.setRequestHandler(UnsubscribeRequestSchema, async (request, extra) => {
			const sessionIdentifier = extra.sessionId ?? 'stateless';
			await backend.unsubscribe(sessionIdentifier, request.params.uri);
			return {};
		});
	}

	if (enableConformanceMode) {
		registerConformanceFixtures(server, context.subscriptionBackend);
	}

	return server;
}
