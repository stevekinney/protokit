import { createMcpHandler } from '@modelcontextprotocol/server';
import type { AuthInfo, McpHandlerRequestOptions } from '@modelcontextprotocol/server';
import { createMcpServer } from '@template/mcp';
import type { McpUserProfile } from '@template/mcp';
import { logger } from '@template/mcp/logger';
import { database, schema } from '@template/database';
import { eq } from 'drizzle-orm';
import { environment } from '@web/env';
import { resourceSubscriptionManager } from '@web/lib/resource-subscription-manager';
import { disconnectRedisSubscriberClient } from '@web/lib/redis-client';
import { readMcpRequestAuthExtra } from '@web/lib/mcp-request-context';

async function fetchUserProfile(userId: string): Promise<McpUserProfile | null> {
	const [user] = await database
		.select({
			id: schema.users.id,
			email: schema.users.email,
			name: schema.users.name,
			image: schema.users.image,
			role: schema.users.role,
		})
		.from(schema.users)
		.where(eq(schema.users.id, userId))
		.limit(1);

	return user ?? null;
}

/**
 * The single MCP server entry: one factory serves both the modern
 * (`2026-07-28`, per-request envelope) protocol era and the legacy
 * (`2025-11-25`) era through the SDK's stateless fallback, from the same
 * tool/resource/prompt registrations. There is no in-process transport
 * registry, session map, or sticky-routing state — every request builds a
 * fresh `McpServer` instance from `ctx.authInfo`, which the HTTP boundary
 * (`mcp-routes.ts`) supplies after verifying the bearer token.
 */
const mcpHttpHandler = createMcpHandler(
	async (ctx) => {
		const requestAuthExtra = readMcpRequestAuthExtra(ctx.authInfo);
		if (!requestAuthExtra) {
			// The HTTP boundary always authenticates before calling `fetch()`;
			// a missing extra here means a caller bypassed that boundary.
			throw new Error('MCP request reached the server factory without verified auth context.');
		}

		const user = await fetchUserProfile(requestAuthExtra.userId);
		if (!user) {
			throw new Error(`MCP request authenticated as unknown user ${requestAuthExtra.userId}.`);
		}

		return createMcpServer({
			userId: requestAuthExtra.userId,
			user,
			enableUiExtension: environment.MCP_ENABLE_UI_EXTENSION,
			enableEnterpriseAuthorizationExtension: environment.MCP_ENABLE_ENTERPRISE_AUTH,
			enableConformanceMode: environment.MCP_CONFORMANCE_MODE,
			subscriptionBackend: resourceSubscriptionManager,
		});
	},
	{
		// Serve 2025-11-25 clients (Claude's current hosted-connector maximum)
		// through the SDK's built-in stateless fallback rather than rejecting
		// them — see the roadmap's compatibility contract.
		legacy: 'stateless',
		onerror: (error) => {
			logger.error({ err: error }, 'MCP handler error');
		},
	},
);

export async function handleMcpRequest(request: Request, authInfo: AuthInfo): Promise<Response> {
	const options: McpHandlerRequestOptions = { authInfo };
	return mcpHttpHandler.fetch(request, options);
}

export async function shutdownMcpTransports(): Promise<void> {
	await mcpHttpHandler.close();
	await disconnectRedisSubscriberClient().catch(() => {});
}
