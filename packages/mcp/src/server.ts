import { McpServer, ProtocolError } from '@modelcontextprotocol/server';
import type { ServerCapabilities } from '@modelcontextprotocol/server';
// CONTENT-001: Bun's default loader for `.md` files renders them to HTML
// (`<p>`, `<h2>`, `<ul>`/`<li>`, etc.) — confirmed empirically, not
// documented behavior this codebase previously relied on correctly. MCP
// `instructions` is read by an LLM client as natural-language text, not
// HTML; shipping literal markup tags would waste characters inside the
// roadmap's 512-character "meaningful without later context" budget and
// actively confuse a client parsing it as prose. Forcing the `text` loader
// via the import attribute below ships the actual Markdown source
// (headings as `## `, lists as `- `, etc.), which is legible prose either
// way and never contains raw HTML tags.
import instructions from './instructions.md' with { type: 'text' };
import { EXTENSION_ID } from '@modelcontextprotocol/ext-apps/server';
import { registerConformanceFixtures } from './conformance-fixture-registration.js';
import { hasRegisteredUiExtensionResource } from './ui-extension-support.js';
import { environment } from './env.js';
import { metricsCollector } from './metrics.js';
import { logger } from './logger.js';
import type {
	McpPromptDefinition,
	McpResourceDefinition,
	McpToolDefinition,
	McpUserProfile,
} from './types/primitives.js';
import type { McpRegistry } from './scope-vocabulary.js';

// META-001 / S-20: a capability advertised here is a promise a connector is
// entitled to rely on. `sampling` and `elicitation` are not even real server
// capabilities (the wire schema has no such keys — they describe what a
// *client* offers a server, not the reverse; the server-to-client fixtures
// that use them work through `ctx.mcpReq.send`, which does not depend on the
// server's own `capabilities` object at all), `logging` has no
// `logging/setLevel` handler and no production caller of
// `notifications/message` outside the conformance fixtures, and neither
// `tools`, `resources`, nor `prompts` ever sends a `list_changed`
// notification, so `listChanged` is set to `false` explicitly rather than
// omitted — the SDK's `registerTool`/`registerResource`/`registerPrompt`
// each default an *unset* `listChanged` bit back to `true` the first time a
// primitive of that kind is registered, so leaving it out here would
// silently re-advertise the same lie this item removes.
function buildServerCapabilities(input: {
	enableConformanceMode: boolean;
	experimentalCapabilities: Record<string, { version: string }>;
	/**
	 * PROTO-002 / S-11: `resources.subscribe` is now genuinely implemented
	 * on the modern (`2026-07-28`) era via the per-request factory's
	 * `subscriptions/listen` stream (see `mcp-handler.ts`'s per-user
	 * `ServerEventBus`, which is what makes delivery authorization-safe —
	 * each user's handler instance has its own event bus, so a
	 * `notifications/resources/updated` push can never reach another
	 * user's stream). The legacy (`2025-11-25`) era still has no delivery
	 * path — PROTO-001 established that legacy serving is per-request and
	 * stateless, so there is no long-lived session to push to — so it
	 * stays unadvertised there; a legacy client's `resources/subscribe`
	 * call still gets a spec-compliant ack (see the handler registration
	 * below), it just never receives an update.
	 */
	subscriptionsEnabled: boolean;
}): ServerCapabilities {
	return {
		tools: { listChanged: false },
		resources: { listChanged: false, ...(input.subscriptionsEnabled ? { subscribe: true } : {}) },
		prompts: { listChanged: false },
		experimental: input.experimentalCapabilities,
		// Conformance fixtures (registered only in conformance mode, never in
		// production) send `notifications/message` — the SDK throws
		// `CapabilityNotSupported` if a server does that without advertising
		// `logging`, so the conformance-only fixture path needs the real
		// capability, scoped to exactly the mode that uses it.
		...(input.enableConformanceMode ? { logging: {} } : {}),
	};
}

/**
 * AUTHZ-001 / round-7 review follow-up: the JSON-RPC error code this server
 * uses for an authenticated but under-scoped `tools/call` / `resources/read`
 * / `prompts/get` request. JSON-RPC reserves `-32000` through `-32099` for
 * implementation-defined server errors; no MCP-spec-assigned code exists
 * for "the token was valid but lacked the scope this operation needs" —
 * confirmed against the installed SDK's `ProtocolErrorCode` enum, which the
 * `2026-07-28` revision uses for `ResourceNotFound` (`-32002`),
 * `MissingRequiredClientCapability` (`-32021`),
 * `UnsupportedProtocolVersion` (`-32022`), and `UrlElicitationRequired`
 * (`-32042`).
 *
 * This previously used `-32001`, which a round-7 review flagged as
 * timeout-flavored and collision-prone. That reads on two separate,
 * independently confirmed pinned packages: `@modelcontextprotocol/sdk`
 * (`1.30.0`, the official client SDK real connectors such as Claude embed)
 * hard-codes `ErrorCode.RequestTimeout = -32001` in its wire-facing
 * `ErrorCode` enum (`dist/esm/types.d.ts`, `dist/cjs/types.d.ts`) — a client
 * using that SDK to talk
 * to this server would classify our insufficient-scope error as its own
 * request having timed out and could retry instead of surfacing the
 * attached `insufficient_scope` challenge. This server's own
 * `@modelcontextprotocol/server` dependency separately hard-codes `-32001`
 * for "Session not found" at several Streamable HTTP transport call sites
 * (`dist/index.mjs`/`dist/index.cjs`) — a second, independent collision.
 * `-32003` is confirmed absent from every `.d.ts`/`.mjs`/`.cjs` file in
 * both installed packages.
 */
const mcpInsufficientScopeErrorCode = -32003;

/**
 * AUTHZ-001: the RFC 6750-shaped challenge this server attaches wherever a
 * request fails purely because the caller's token lacks `requiredScope` —
 * as a tool result's `_meta['mcp/www_authenticate']` (the SDK has no typed
 * `securitySchemes` field on `Tool` to attach this to instead; confirmed
 * against the installed `@modelcontextprotocol/server@2.0.0` type
 * definitions) and as `data` on the `ProtocolError` thrown for resources
 * and prompts, which have no error-result shape of their own to carry a
 * `_meta` object on.
 */
function insufficientScopeChallenge(requiredScope: string): string {
	return `Bearer error="insufficient_scope", scope="${requiredScope}"`;
}

function hasRequiredScope(grantedScopes: readonly string[], requiredScope: string): boolean {
	return grantedScopes.includes(requiredScope);
}

/**
 * Round-seventeen review (P2): `resources/read` rejects an under-scoped
 * request via `assertRequiredScope` before the handler ever runs, but the
 * `2026-07-28` `subscriptions/listen` stream (the push-notification path a
 * modern client uses to receive `notifications/resources/updated` for
 * `resourceSubscriptions: [uri, ...]`) never consulted scopes at all — a
 * client holding only `prompts:read` could still subscribe to
 * `user://profile` (which requires `profile:read`) and would receive a
 * `resource_updated` event the moment that resource actually changed,
 * despite never having been granted `profile:read`. That is a real
 * authorization bypass: it leaks the *fact* that a scoped resource changed
 * to a caller who was never allowed to read its contents.
 *
 * Root cause of why this could not simply reuse `assertRequiredScope`
 * in-place: the installed `@modelcontextprotocol/server@2.0.0` SDK serves
 * `subscriptions/listen` entirely outside the registered-handler dispatch
 * this factory wires up. Confirmed by reading the SDK's own bundled
 * `createMcpHandler` (`dist/index.mjs`): on a `subscriptions/listen`
 * request it builds a FRESH server via the factory, reads only
 * `server.getCapabilities()` off it, immediately calls `product.close()`,
 * and hands the request to its own internal `listenRouter.serve(...)` —
 * the constructed `McpServer` instance (and therefore anything registered
 * on it, including `assertRequiredScope`'s call sites) never sees the
 * request at all, and the factory itself is never even passed the
 * requested `resourceSubscriptions` URIs to filter against. There is
 * consequently no request-handler hook inside `createMcpServer` capable of
 * enforcing this — the enforcement point has to live at the HTTP boundary
 * that owns the raw request body, before it is ever handed to
 * `McpHttpHandler.fetch()`.
 *
 * This function is the reusable piece `createMcpServer` CAN own: the same
 * scope-lookup `assertRequiredScope` performs (grantedScopes vs. a
 * resource definition's `requiredScope`), applied per requested URI against
 * the registry's resources, the single source of truth for which scope each resource
 * needs. `applications/web/src/lib/mcp-handler.ts` already peeks the
 * request body to detect a `subscriptions/listen` call before dispatch
 * (see `isSubscriptionsListenRequest`, added for an unrelated shutdown-
 * tracking reason) — that is the natural call site for this function: read
 * `params.notifications.resourceSubscriptions` off the same already-parsed
 * body, call this with the caller's verified `scopes`, and refuse the
 * WHOLE request (a single JSON-RPC error, not a per-URI partial ack) when
 * it returns `false`.
 *
 * Design decision — reject the whole request, not a filtered subset:
 * silently attaching only the permitted URIs while acking the rest would
 * (a) never inform the client which of its requested subscriptions it
 * actually got, and (b) let a caller distinguish "URI exists but I lack
 * scope" from "URI doesn't exist" by comparing which URIs it lists in an
 * absence-of-updates versus an outright rejection — a probe channel. A
 * single all-or-nothing rejection, mirroring how `resources/read` already
 * collapses "expired token" and "wrong audience" into one wire response
 * (see `mcp-routes.ts`'s `OBS-001` comment), discloses nothing about which
 * specific URI(s) failed or why. Fails closed: an unrecognized URI is
 * treated identically to a recognized-but-under-scoped one (both deny),
 * so denial never confirms or denies a resource's existence either.
 */
export function areResourceSubscriptionsAuthorized(
	uris: readonly string[],
	scopes: readonly string[],
	registry: McpRegistry,
): boolean {
	return uris.every((uri) => {
		const resource = registry.resources.find((definition) => definition.uri === uri);
		return resource !== undefined && hasRequiredScope(scopes, resource.requiredScope);
	});
}

export function createMcpServer(
	context: {
		userId: string;
		user: McpUserProfile;
		/**
		 * OBS-001: the HTTP-boundary request identifier, threaded through to
		 * every tool/resource/prompt handler via `McpContext.requestId` so one
		 * connector action can be traced end to end through logs. Undefined for
		 * callers that build a server outside a real HTTP request (the
		 * standalone conformance server, tests).
		 */
		requestId?: string;
		enableUiExtension: boolean;
		enableConformanceMode?: boolean;
		/**
		 * PROTO-002: which protocol era this particular `McpServer` instance
		 * will serve. Drives whether `resources.subscribe` is advertised (only
		 * ever true on `'modern'` — see `buildServerCapabilities`) — legacy
		 * serving has no delivery path for a subscription push. Defaults to
		 * `'legacy'` so existing callers (tests, the standalone conformance
		 * server) that do not pass it keep today's unadvertised behavior.
		 */
		era?: 'legacy' | 'modern';
		/**
		 * PROTO-002 / S-11: publishes a `notifications/resources/updated` event
		 * scoped to only this context's `userId` (see
		 * `applications/web/src/lib/mcp-user-event-bus.ts`). Undefined when no
		 * event bus is wired for this request (e.g. the standalone conformance
		 * server) — `resources/subscribe` still acks, it just never delivers.
		 */
		publishResourceUpdate?: (uri: string) => Promise<void>;
		/**
		 * AUTHZ-001: the OAuth scopes the caller's access token actually carries
		 * (`McpRequestAuthExtra.scopes`, verified against the database by the
		 * HTTP boundary before this factory is ever called). Enforced here,
		 * once, before any tool/resource/prompt handler runs — "missing scopes
		 * fail before application data is read," per the roadmap's own wording
		 * for this item.
		 */
		scopes: readonly string[];
	},
	registry: McpRegistry,
): McpServer {
	const era = context.era ?? 'legacy';
	const enableConformanceMode = context.enableConformanceMode ?? environment.mcpConformanceMode;
	const experimentalCapabilities: Record<string, { version: string }> = {};
	// CONTENT-001 / review finding: advertising the MCP Apps extension is not
	// just gated on the `MCP_ENABLE_UI_EXTENSION` flag (which defaults off,
	// but an operator can still set it) — it also requires at least one
	// registered resource that is actually an MCP App (`RESOURCE_MIME_TYPE`).
	// `hasRegisteredUiExtensionResource(registry)` is the single source of truth for
	// that predicate, shared with `oauth-routes.ts`'s authorization-server
	// metadata `extensions` field — see its own doc comment for why that
	// sharing matters. `packages/mcp-apps` ships no application today, so
	// this mechanically keeps the capability absent even if the flag is
	// turned on by mistake, rather than only relying on the default. Once a
	// real app + resource exists, this becomes true on its own with no
	// further change needed here.
	if (context.enableUiExtension && hasRegisteredUiExtensionResource(registry)) {
		experimentalCapabilities[EXTENSION_ID] = { version: '1.0.0' };
	}

	const serverName = environment.mcpServerName ?? 'template-mcp-server';

	const server = new McpServer(
		{
			name: serverName,
			version: '0.1.0',
		},
		{
			instructions: registry.instructions ?? instructions,
			capabilities: buildServerCapabilities({
				enableConformanceMode,
				experimentalCapabilities,
				subscriptionsEnabled: era === 'modern' && context.publishResourceUpdate !== undefined,
			}),
		},
	);

	function registerToolDefinition(tool: McpToolDefinition): void {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
				...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
				annotations: tool.annotations,
				...(tool._meta ? { _meta: tool._meta } : {}),
			},
			async (input, ctx) => {
				if (!hasRequiredScope(context.scopes, tool.requiredScope)) {
					// OBS-001: "insufficient scope" — one of the eight outcomes the
					// roadmap requires operators to be able to distinguish. Logs
					// the required scope, never the caller's actual (insufficient)
					// scope set or token.
					logger.warn(
						{
							event: 'mcp_tool_call',
							outcome: 'insufficient_scope',
							tool: tool.name,
							requiredScope: tool.requiredScope,
							userId: context.userId,
							requestId: context.requestId,
						},
						'MCP tool call rejected: insufficient scope',
					);
					metricsCollector.recordToolInvocation(tool.name, 0, true);
					metricsCollector.recordEvent('mcp_method', 'insufficient_scope');
					return {
						content: [
							{
								type: 'text' as const,
								text: `Insufficient scope: this tool requires '${tool.requiredScope}'.`,
							},
						],
						isError: true,
						_meta: { 'mcp/www_authenticate': insufficientScopeChallenge(tool.requiredScope) },
					};
				}

				const start = Date.now();
				// PROTO-002: thread the SDK's own per-request AbortSignal through
				// so a handler that awaits a cancellable operation genuinely stops
				// work on client disconnect/`notifications/cancelled`, instead of
				// only abandoning a wrapper promise.
				const result = await tool.handler(input as never, {
					...context,
					signal: ctx.mcpReq.signal,
				});
				const isError = 'isError' in result && result.isError === true;
				metricsCollector.recordToolInvocation(tool.name, Date.now() - start, isError);
				if (isError) {
					// OBS-001: "tool failure" — distinct from `insufficient_scope`
					// above (an authorization decision made before the handler ever
					// ran) and from `mcp_transport` in `mcp-handler.ts` (a failure
					// the SDK's own transport layer catches, not a structured tool
					// result). Never logs tool input/output — both can carry
					// caller-supplied or generated content.
					logger.warn(
						{
							event: 'mcp_tool_call',
							outcome: 'tool_failure',
							tool: tool.name,
							userId: context.userId,
							requestId: context.requestId,
						},
						'MCP tool call returned an error result',
					);
					metricsCollector.recordEvent('mcp_method', 'tool_failure');
				}
				return result;
			},
		);
	}

	for (const tool of registry.tools) {
		registerToolDefinition(tool);
	}

	/**
	 * AUTHZ-001: `resources/read` and `prompts/get` have no `isError` result
	 * variant to answer an under-scoped request with (unlike `CallToolResult`
	 * above), so an under-scoped request throws instead — the SDK turns a
	 * thrown `ProtocolError` into a JSON-RPC error response carrying its
	 * `data`, which is where the `_meta['mcp/www_authenticate']` challenge
	 * lives for these two primitive kinds.
	 */
	function assertRequiredScope(
		definition: Pick<McpResourceDefinition | McpPromptDefinition, 'name' | 'requiredScope'>,
	): void {
		if (hasRequiredScope(context.scopes, definition.requiredScope)) return;
		throw new ProtocolError(
			mcpInsufficientScopeErrorCode,
			`Insufficient scope: '${definition.name}' requires '${definition.requiredScope}'.`,
			{
				requiredScope: definition.requiredScope,
				_meta: { 'mcp/www_authenticate': insufficientScopeChallenge(definition.requiredScope) },
			},
		);
	}

	for (const resource of registry.resources) {
		server.registerResource(
			resource.name,
			resource.uri,
			{ title: resource.title, description: resource.description, mimeType: resource.mimeType },
			async (uri, ctx) => {
				assertRequiredScope(resource);
				return resource.handler(uri, { ...context, signal: ctx.mcpReq.signal });
			},
		);
	}

	for (const prompt of registry.prompts) {
		server.registerPrompt(
			prompt.name,
			{
				title: prompt.title,
				description: prompt.description,
				...(prompt.arguments ? { argsSchema: prompt.arguments } : {}),
			},
			async (arguments_, ctx) => {
				assertRequiredScope(prompt);
				return prompt.handler(arguments_ as never, { ...context, signal: ctx.mcpReq.signal });
			},
		);
	}

	// PROTO-002 / S-11: `resources/subscribe` and `resources/unsubscribe` are
	// always registered (spec-compliant ack) because a low-level `Server`
	// (unlike `McpServer`'s auto-handling) is responsible for answering any
	// method it advertises a capability for, and — on the legacy era, or
	// when the era hasn't been told — the capability may be absent while a
	// tolerant client still probes the method. Real delivery happens
	// entirely on the `2026-07-28` `subscriptions/listen` stream, which the
	// SDK's `createMcpHandler` serves itself against the per-user
	// `ServerEventBus` `mcp-handler.ts` constructs (see
	// `applications/web/src/lib/mcp-user-event-bus.ts`); there is no
	// interest-tracking bookkeeping left to do here — the SDK's own listen
	// router filters each stream to the URIs its own request opted into,
	// and the per-user bus means one user's published update is physically
	// unreachable from another user's stream. `resources/subscribe` itself
	// does not need to record anything for that to be true.
	//
	// Round-seventeen review: does this unconditional `{}` ack need the same
	// scope check `areResourceSubscriptionsAuthorized` (below) adds for the
	// modern `subscriptions/listen` path? No — deliberately checked and
	// ruled out, not merely overlooked. This handler exists ONLY for the
	// legacy (`2025-11-25`) era, and PROTO-001 already established that
	// legacy serving is per-request and stateless: there is no long-lived
	// session for this era to push a `resource_updated` notification onto,
	// full stop, regardless of what any legacy `resources/subscribe` call
	// requested. An unconditional `{}` ack that never leads to delivery
	// leaks nothing an authorization check could prevent — it doesn't even
	// confirm the named URI corresponds to a real resource, since it acks
	// identically for any input. The actual bypass this review round found
	// lives exclusively on the modern path, where a subscription genuinely
	// can and does deliver events later.
	server.server.setRequestHandler('resources/subscribe', async () => ({}));
	server.server.setRequestHandler('resources/unsubscribe', async () => ({}));

	if (enableConformanceMode) {
		// CONTENT-001: synthetic/protocol-only fixtures (e.g. `list_audit_events`,
		// which returns generated data and exists to exercise cursor pagination)
		// are registered here rather than in `registry.tools`, so a production
		// deployment — which never sets `enableConformanceMode` — never
		// advertises or serves them.
		for (const tool of registry.conformanceOnlyTools ?? []) {
			registerToolDefinition(tool);
		}
		registerConformanceFixtures(server, context.publishResourceUpdate);
	}

	return server;
}
