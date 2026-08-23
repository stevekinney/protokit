import { createMcpHandler } from '@modelcontextprotocol/server';
import type {
	AuthInfo,
	McpHandlerRequestOptions,
	McpHttpHandler,
} from '@modelcontextprotocol/server';
import { createMcpServer } from '@template/mcp';
import type { McpUserProfile } from '@template/mcp';
import { logger } from '@template/mcp/logger';
import { metricsCollector } from '@template/mcp/metrics';
import { database, schema } from '@template/database';
import { eq } from 'drizzle-orm';
import { environment } from '@web/env';
import { createUserServerEventBus } from '@web/lib/mcp-user-event-bus';
import { McpUserHandlerCache } from '@web/lib/mcp-user-handler-cache';
import { disconnectRedisSubscriberClient, isRedisConfigured } from '@web/lib/redis-client';
import { markAsServerOnlyCloseableStream } from '@web/lib/in-flight-request-tracker';
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
//
// This predicate deliberately does not also check NODE_ENV: production
// misconfiguration (MCP_CONFORMANCE_MODE=true in a production deployment,
// where tunnelActive is normally false) is refused earlier and harder, at
// process startup, by `assertProductionStartupInvariants()`
// (`startup-invariants.ts` / `production-startup-requirements.ts`) — the
// server never reaches this call at all with that misconfiguration in
// production, rather than silently degrading here.
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
				requestId: requestAuthExtra.requestId,
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
				// OBS-001: "transport failure" — one of the eight outcomes the
				// roadmap requires operators to be able to distinguish. This is
				// the SDK's own catch-all for a request the transport itself
				// could not serve (malformed JSON-RPC, a stream that closed
				// mid-response, etc.), as opposed to a tool returning a
				// structured error result (see `mcp_tool_failure` in
				// `server.ts`, which is a different outcome).
				logger.error({ err: error, userId, event: 'mcp_transport' }, 'MCP handler error');
				metricsCollector.recordEvent('mcp_method', 'transport_failure');
			},
		},
	);

	return { handler, bus };
}

const userHandlers = new McpUserHandlerCache(createUserHandlerEntry);
userHandlers.startSweep(mcpUserHandlerSweepIntervalMs, mcpUserHandlerIdleMs);

/**
 * Review finding (P2): `createUserHandlerEntry` above advertises
 * `resources.subscribe` for the modern era whenever a
 * `publishResourceUpdate` callback is wired in (true in production), but
 * nothing outside the conformance fixtures ever called it — a real profile
 * mutation (`upsertGoogleUser`) never notified a subscriber, so a
 * production client could subscribe to `user://profile` and receive only
 * keepalives. This is the publish-side counterpart callers use from
 * outside the request path that owns a live `McpHttpHandler` for this user
 * (session, account-connection, and identity routes are not themselves MCP
 * requests, so they have no handler instance of their own to call
 * `.notify` on).
 *
 * The original version of this function lived in `mcp-user-event-bus.ts`
 * and always called `createUserServerEventBus(userId).publish(...)` —
 * unconditionally constructing a brand-new bus instance rather than
 * reusing this module's own `userHandlers` cache. That is correct for the
 * Redis-backed bus (`publish()` fans out over Redis regardless of which
 * process holds this user's open `subscriptions/listen` stream, the same
 * cross-instance guarantee `McpUserHandlerCache` documents), but it was a
 * real defect for the in-memory fallback (Redis not configured, e.g. local
 * development): the handler this process actually serves
 * `subscriptions/listen` from subscribes to the `bus` bound to ITS OWN
 * `McpHttpHandler` instance (`createUserHandlerEntry`, above), while the
 * fresh `InMemoryServerEventBus()` the old code constructed here had no
 * listeners at all — a modern client was correctly told
 * `resources.subscribe` is supported, but a real update could never reach
 * it locally.
 *
 * Fix: reuse the cached handler's own bus (`userHandlers.peek`, which does
 * NOT create an entry — there is nothing to notify if this process has
 * never served this user an MCP request) via the same `handler.notify`
 * path the in-request `publishResourceUpdate` callback above already
 * uses. Only when no local entry exists does this fall back to a fresh
 * `createUserServerEventBus(userId).publish(...)` — and only when Redis is
 * configured, since that is the only case where publishing to a channel
 * nothing in THIS process is subscribed to can possibly reach a listener
 * (a different process instance). With Redis not configured and no local
 * handler, there is no deliverable path at all, so there is nothing to do.
 */
export function publishUserResourceUpdate(userId: string, uri: string): void {
	const existing = userHandlers.peek(userId);
	if (existing) {
		existing.handler.notify.resourceUpdated(uri);
		return;
	}
	if (isRedisConfigured()) {
		createUserServerEventBus(userId).publish({ kind: 'resource_updated', uri });
	}
}

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
/**
 * A P1 review finding on `in-flight-request-tracker.ts`: a
 * `subscriptions/listen` response is the one shape whose body only ever
 * settles via this process's own explicit `shutdownMcpTransports()` call
 * (the client disconnecting or the SDK's own subscription cap evicting it
 * aside) -- never on its own, and never sooner because something waited
 * longer. Counting it toward `gracefulShutdown`'s drain made the drain
 * wait on a call that only runs after the drain returns. Peeking the
 * already-bounded request body here (a cheap, already-small JSON-RPC
 * envelope -- `boundedRequest` enforces `S-05`'s size cap before this ever
 * runs) is the one place this module can know a request is a listen call
 * BEFORE handing it to the SDK, so the resulting response can be marked
 * for the tracker to treat specially. `request.clone()` tees the
 * already-bounded stream rather than consuming it -- verified directly
 * against Bun that both the clone and the original independently parse
 * the identical body -- so this never risks the real request seeing a
 * different, already-partially-read stream.
 */
async function isSubscriptionsListenRequest(request: Request): Promise<boolean> {
	if (!request.body) return false;
	try {
		const parsed: unknown = await request.clone().json();
		const messages = Array.isArray(parsed) ? parsed : [parsed];
		return messages.some(
			(message) =>
				typeof message === 'object' &&
				message !== null &&
				(message as { method?: unknown }).method === 'subscriptions/listen',
		);
	} catch {
		// Malformed JSON here just means "not a listen request" -- the SDK
		// still sees the original, unconsumed request and produces its own
		// real JSON-RPC parse-error response.
		return false;
	}
}

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
	const isListenRequest = await isSubscriptionsListenRequest(boundedRequest);
	const response = await handler.fetch(boundedRequest, options);
	return isListenRequest ? markAsServerOnlyCloseableStream(response) : response;
}

export async function shutdownMcpTransports(): Promise<void> {
	await userHandlers.closeAll();
	await disconnectRedisSubscriberClient().catch(() => {});
}
