import { createMcpHandler } from '@modelcontextprotocol/server';
import type {
	AuthInfo,
	McpHandlerRequestOptions,
	McpHttpHandler,
} from '@modelcontextprotocol/server';
import { createMcpServer } from '@template/mcp';
import type { McpUserProfile } from '@template/mcp';
import { logger } from '@template/mcp/logger';
import { database, schema } from '@template/database';
import { eq } from 'drizzle-orm';
import { environment } from '@web/env';
import { createUserServerEventBus } from '@web/lib/mcp-user-event-bus';
import { McpUserHandlerCache } from '@web/lib/mcp-user-handler-cache';
import { disconnectRedisSubscriberClient } from '@web/lib/redis-client';
import { readMcpRequestAuthExtra } from '@web/lib/mcp-request-context';
import { boundRequestBody, PayloadTooLargeError } from '@web/lib/bounded-request-body';
import { createMcpProtocolErrorResponse } from '@web/lib/mcp-protocol-error-response';
import { mcpLatestProtocolVersion } from '@web/lib/mcp-protocol-constants';
import {
	mcpRequestMaxBodyBytes,
	mcpMaxSubscriptionsPerUserHandler,
	mcpUserHandlerIdleMs,
	mcpUserHandlerSweepIntervalMs,
} from '@web/lib/request-limits';

// CONFIG-001: exported so it can be unit-tested directly without booting a
// full MCP client/server round trip. Conformance fixtures are dev/test-only
// surface area and must never register while a public tunnel is active,
// regardless of what MCP_CONFORMANCE_MODE happens to be set to locally.
export function shouldEnableConformanceMode(input: {
	conformanceModeConfigured: boolean;
	tunnelActive: boolean;
}): boolean {
	return input.conformanceModeConfigured && !input.tunnelActive;
}

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
 * PROTO-002 / S-11: one `McpHttpHandler` per authenticated user, not one
 * shared handler for the whole process. `subscriptions/listen` (the
 * `2026-07-28` push-notification mechanism) fans out over an SDK-supplied
 * `ServerEventBus` that `createMcpHandler` binds once at construction and
 * filters purely by resource URI — it has no notion of caller identity. If
 * every user shared one handler (and therefore one bus), publishing an
 * update for user A's `user://profile` would reach user B's open listen
 * stream too, the moment B also names that same literal URI (which every
 * user does — it is a fixed "my own profile" address, not per-user). That
 * is exactly `S-11`: a resource update crossing a user boundary.
 *
 * Giving each user their own handler/bus means a published event is
 * physically confined to that user's Redis channel
 * (`mcp-user-event-bus.ts`) — there is no filter to get wrong, because
 * there is nothing else subscribed to that channel. See
 * `mcp-user-handler-cache.ts` for how this in-process registry stays
 * bounded (idle eviction) and why correctness does not depend on any one
 * instance holding a particular user's entry.
 */
function createUserHandlerEntry(userId: string): {
	handler: McpHttpHandler;
	bus: ReturnType<typeof createUserServerEventBus>;
} {
	const bus = createUserServerEventBus(userId);

	// `handler` is referenced inside its own factory (`publishResourceUpdate`)
	// before the `createMcpHandler(...)` call below finishes assigning it —
	// safe because the factory only runs later, once a request actually
	// reaches this specific user's handler, by which point this `const`
	// binding is long since initialized (`createMcpHandler` only wires the
	// factory in; it never invokes it synchronously during construction).
	const handler: McpHttpHandler = createMcpHandler(
		async (ctx) => {
			const requestAuthExtra = readMcpRequestAuthExtra(ctx.authInfo);
			if (!requestAuthExtra) {
				// The HTTP boundary always authenticates before calling `fetch()`;
				// a missing extra here means a caller bypassed that boundary.
				throw new Error('MCP request reached the server factory without verified auth context.');
			}
			if (requestAuthExtra.userId !== userId) {
				// Defense in depth: this handler is only ever looked up by
				// `userId` in `handleMcpRequest` below, so this should be
				// unreachable — but if it were ever reachable, silently serving
				// it would be exactly the cross-user delivery bug this cache
				// exists to prevent.
				throw new Error('MCP request authenticated user does not match its routed handler.');
			}

			const user = await fetchUserProfile(requestAuthExtra.userId);
			if (!user) {
				throw new Error(`MCP request authenticated as unknown user ${requestAuthExtra.userId}.`);
			}

			return createMcpServer({
				userId: requestAuthExtra.userId,
				user,
				enableUiExtension: environment.MCP_ENABLE_UI_EXTENSION,
				enableConformanceMode: shouldEnableConformanceMode({
					conformanceModeConfigured: environment.MCP_CONFORMANCE_MODE,
					tunnelActive: environment.PROTOKIT_TUNNEL_ACTIVE,
				}),
				era: ctx.era,
				publishResourceUpdate: async (uri) => {
					handler.notify.resourceUpdated(uri);
				},
				scopes: requestAuthExtra.scopes,
			});
		},
		{
			// Serve 2025-11-25 clients (Claude's current hosted-connector maximum)
			// through the SDK's built-in stateless fallback rather than rejecting
			// them — see the roadmap's compatibility contract.
			legacy: 'stateless',
			bus,
			maxSubscriptions: mcpMaxSubscriptionsPerUserHandler,
			onerror: (error) => {
				logger.error({ err: error, userId }, 'MCP handler error');
			},
		},
	);

	return { handler, bus };
}

const userHandlers = new McpUserHandlerCache(createUserHandlerEntry);
userHandlers.startSweep(mcpUserHandlerSweepIntervalMs, mcpUserHandlerIdleMs);

/**
 * S-05: MCP request bodies were handed straight to the SDK, which buffers
 * and JSON-RPC-parses them internally with no size limit of its own. Every
 * body the SDK will ever read here goes through `boundRequestBody` first —
 * a declared `Content-Length` over the limit is rejected before the SDK
 * sees the request at all (no server-factory call, no database read); an
 * actual byte count that only exceeds the limit once streaming begins
 * (a dishonest or absent `Content-Length`, i.e. chunked transfer encoding)
 * errors the wrapped stream, which the SDK itself turns into its own
 * stable JSON-RPC parse-error response rather than ever reaching the
 * server factory.
 */
export async function handleMcpRequest(request: Request, authInfo: AuthInfo): Promise<Response> {
	const options: McpHandlerRequestOptions = { authInfo };

	let boundedRequest: Request;
	try {
		boundedRequest = boundRequestBody(request, mcpRequestMaxBodyBytes);
	} catch (error) {
		if (error instanceof PayloadTooLargeError) {
			return createMcpProtocolErrorResponse({
				status: 413,
				error: 'payload_too_large',
				errorDescription: error.message,
				headers: { 'MCP-Protocol-Version': mcpLatestProtocolVersion },
			});
		}
		throw error;
	}

	const requestAuthExtra = readMcpRequestAuthExtra(authInfo);
	if (!requestAuthExtra) {
		// `mcp-routes.ts` always authenticates before calling this function;
		// a missing extra here means a caller bypassed that boundary.
		throw new Error('MCP request reached the handler without verified auth context.');
	}

	const { handler } = userHandlers.get(requestAuthExtra.userId);
	return handler.fetch(boundedRequest, options);
}

export async function shutdownMcpTransports(): Promise<void> {
	await userHandlers.closeAll();
	await disconnectRedisSubscriberClient().catch(() => {});
}
