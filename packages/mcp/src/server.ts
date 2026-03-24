import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
	SubscribeRequestSchema,
	UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { allTools } from './tools/index.js';
import { allResources } from './resources/index.js';
import { allPrompts } from './prompts/index.js';
import instructions from './instructions.md';
import { EXTENSION_ID } from '@modelcontextprotocol/ext-apps/server';
import { registerConformanceFixtures } from './conformance-fixture-registration.js';
import { environment } from './env.js';
import { metricsCollector } from './metrics.js';
import type { ResourceSubscriptionBackend } from './resource-subscription-backend.js';
import type { McpUserProfile } from './types/primitives.js';

const oauthClientCredentialsExtensionIdentifier =
	'io.modelcontextprotocol/oauth-client-credentials';
const enterpriseAuthorizationExtensionIdentifier =
	'io.modelcontextprotocol/enterprise-managed-authorization';

export function createMcpServer(context: {
	userId: string;
	user: McpUserProfile;
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

	const serverName = environment.MCP_SERVER_NAME ?? 'template-mcp-server';

	const server = new McpServer(
		{
			name: serverName,
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

	for (const tool of allTools) {
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				inputSchema: tool.inputSchema,
				...(tool.annotations ? { annotations: tool.annotations } : {}),
				...(tool._meta ? { _meta: tool._meta } : {}),
			},
			async (input) => {
				const start = Date.now();
				const result = await tool.handler(input as never, context);
				metricsCollector.recordToolInvocation(
					tool.name,
					Date.now() - start,
					'isError' in result && result.isError === true,
				);
				return result;
			},
		);
	}

	for (const resource of allResources) {
		server.registerResource(
			resource.name,
			resource.uri,
			{ description: resource.description, mimeType: resource.mimeType },
			async (uri) => resource.handler(uri, context),
		);
	}

	for (const prompt of allPrompts) {
		server.registerPrompt(
			prompt.name,
			{
				description: prompt.description,
				...(prompt.arguments ? { argsSchema: prompt.arguments } : {}),
			},
			async (arguments_) => prompt.handler(arguments_ as never, context),
		);
	}

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
