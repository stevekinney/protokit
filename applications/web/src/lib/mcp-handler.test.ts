import { describe, expect, it, mock } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { cancellableOperationTestHooks } from '@lostgradient/mcp';

mock.module('@web/env', () => ({
	environment: {
		mcpEnableUiExtension: false,
		// Conformance mode is on for this suite (unlike production) so the
		// S-11 regression test below can drive the real
		// `test_watched_resource_update` fixture instead of reaching into
		// `mcp-handler.ts` internals — `shouldEnableConformanceMode`'s own
		// pure-function unit tests above don't read this mock at all, and no
		// other test in this file asserts anything is *absent* because of it.
		mcpConformanceMode: true,
		protokitTunnelActive: false,
	},
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => [
						{
							id: 'user-1',
							email: 'user@example.com',
							name: 'Test User',
							image: null,
							role: 'user',
						},
					],
				}),
			}),
		}),
	},
	schema: {
		users: { id: 'id', email: 'email', name: 'name', image: 'image', role: 'role' },
	},
}));

mock.module('drizzle-orm', () => ({
	eq: (column: unknown, value: unknown) => ({ column, value }),
}));

const {
	handleMcpRequest,
	shouldEnableConformanceMode,
	publishUserResourceUpdate,
	shutdownMcpTransports,
} = await import('@web/lib/mcp-handler');

/**
 * OBS-001 acceptance criterion 2: "a trace follows one connector action
 * from HTTP entry through OAuth validation and tool completion." This
 * exercises the real, unmocked path end to end — `buildAuthInfo`'s
 * `requestId` (standing in for `application.ts`'s HTTP-boundary
 * `requestId`) through `readMcpRequestAuthExtra`, into
 * `createMcpServer`'s context, into a real tool call — and asserts the
 * SAME `requestId` shows up on the resulting structured log line, proving
 * the plumbing rather than just its types.
 */
describe('requestId trace propagation (OBS-001)', () => {
	it('carries the HTTP-boundary requestId into a tool-call log line', async () => {
		const warnCalls: unknown[] = [];
		const { logger } = await import('@lostgradient/mcp/logger');
		const originalWarn = logger.warn.bind(logger);
		logger.warn = ((...args: Parameters<typeof logger.warn>) => {
			warnCalls.push(args[0]);
			return originalWarn(...args);
		}) as typeof logger.warn;

		try {
			const traceRequestId = 'trace-test-req-id-12345';
			const client = new Client({ name: 'trace-test-client', version: '1.0.0' });
			const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
				fetch: async (input: string | URL, init?: RequestInit) =>
					handleMcpRequest(
						new Request(input, init),
						// Deliberately under-scoped (missing `profile:read`, which
						// `get_user_profile` requires) so the call reliably produces
						// the `insufficient_scope` warn line this test reads.
						buildAuthInfo({ scopes: ['audit:read'], requestId: traceRequestId }),
					),
			});
			await client.connect(transport);

			const result = await client.callTool({ name: 'get_user_profile', arguments: {} });
			expect(result.isError).toBe(true);

			await client.close();

			const matching = warnCalls.find(
				(call) =>
					typeof call === 'object' &&
					call !== null &&
					(call as Record<string, unknown>).requestId === traceRequestId,
			);
			expect(matching).toBeDefined();
			expect((matching as Record<string, unknown>).outcome).toBe('insufficient_scope');
		} finally {
			logger.warn = originalWarn;
		}
	});
});

describe('shouldEnableConformanceMode', () => {
	it('is false when conformance mode is not configured', () => {
		expect(
			shouldEnableConformanceMode({ conformanceModeConfigured: false, tunnelActive: false }),
		).toBe(false);
	});

	it('is true when conformance mode is configured and no tunnel is active', () => {
		expect(
			shouldEnableConformanceMode({ conformanceModeConfigured: true, tunnelActive: false }),
		).toBe(true);
	});

	it('is false when a tunnel is active, even if conformance mode is configured', () => {
		expect(
			shouldEnableConformanceMode({ conformanceModeConfigured: true, tunnelActive: true }),
		).toBe(false);
	});
});

// AUTHZ-001: every real tool/resource/prompt requires one of the server's
// actual scopes (`profile:read`/`audit:read`/`prompts:read` — see
// `packages/mcp/src/scopes.ts`), not a placeholder like the old `mcp:read`
// this fixture used to grant. Granting the full vocabulary here matches
// what an operator's own conformance/E2E client would request, and this
// suite exists to exercise the MCP wiring, not scope enforcement itself
// (that is `AUTHZ-001`'s own test file's job).
const grantedScopes = ['profile:read', 'audit:read', 'prompts:read'];

function buildAuthInfo(overrides?: Partial<AuthInfo['extra']>): AuthInfo {
	const userId = (overrides?.userId as string | undefined) ?? 'user-1';
	return {
		token: 'test-token',
		clientId: 'client-1',
		scopes: grantedScopes,
		resource: new URL('http://localhost:3000/mcp'),
		extra: {
			userId,
			// OPEN-12: the HTTP boundary now fetches the profile once, in the
			// same round trip as the token lookup, and carries it here rather
			// than `mcp-handler.ts` fetching it again per request -- this
			// fixture stands in for that boundary, matching the shape
			// `mcp-routes.ts`'s `authenticateMcpUser` actually produces.
			userProfile: {
				id: userId,
				email: 'user@example.com',
				name: 'Test User',
				image: null,
				role: 'user',
			},
			oauthClientId: 'client-1',
			scopes: grantedScopes,
			resource: 'http://localhost:3000/mcp',
			...overrides,
		},
	};
}

async function fetchThroughHandler(input: string | URL, init?: RequestInit): Promise<Response> {
	return handleMcpRequest(new Request(input, init), buildAuthInfo());
}

describe('handleMcpRequest', () => {
	it('serves a 2025-11-25 (legacy) client through the SDK stateless fallback', async () => {
		const client = new Client({ name: 'legacy-test-client', version: '1.0.0' });
		const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
			fetch: fetchThroughHandler,
		});

		await client.connect(transport);
		expect(client.getProtocolEra()).toBe('legacy');

		const tools = await client.listTools();
		expect(tools.tools.some((tool) => tool.name === 'get_user_profile')).toBe(true);

		await client.close();
	});

	it('serves a 2026-07-28 (modern) client via server/discover with no session state', async () => {
		const client = new Client(
			{ name: 'modern-test-client', version: '1.0.0' },
			{ versionNegotiation: { mode: 'auto' } },
		);
		const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
			fetch: fetchThroughHandler,
		});

		await client.connect(transport);
		expect(client.getProtocolEra()).toBe('modern');

		const tools = await client.listTools();
		expect(tools.tools.some((tool) => tool.name === 'get_user_profile')).toBe(true);

		const result = await client.callTool({ name: 'get_user_profile', arguments: {} });
		expect(Boolean(result.isError)).toBe(false);

		await client.close();
	});

	it('rejects a modern request whose MCP-Protocol-Version header does not match its envelope', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'mcp-method': 'tools/list',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/list',
				params: {
					_meta: {
						'io.modelcontextprotocol/protocolVersion': '2026-07-28',
					},
				},
			}),
		});

		expect(response.status).toBe(400);
	});

	it('rejects a modern tools/call request missing the required Mcp-Method header', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'mcp-protocol-version': '2026-07-28',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/list',
				params: {
					_meta: {
						'io.modelcontextprotocol/protocolVersion': '2026-07-28',
						'io.modelcontextprotocol/clientCapabilities': {},
					},
				},
			}),
		});

		expect(response.status).toBe(400);
	});

	it('rejects a modern tools/call request whose Mcp-Name disagrees with the body', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'mcp-protocol-version': '2026-07-28',
				'mcp-method': 'tools/call',
				'mcp-name': 'wrong_tool_name',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'get_user_profile',
					arguments: {},
					_meta: {
						'io.modelcontextprotocol/protocolVersion': '2026-07-28',
						'io.modelcontextprotocol/clientCapabilities': {},
					},
				},
			}),
		});

		expect(response.status).toBe(400);
	});

	it('rejects a JSON-RPC batch on the modern path', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'mcp-protocol-version': '2026-07-28',
			},
			body: JSON.stringify([
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/list',
					params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
				},
			]),
		});

		expect(response.status).toBeGreaterThanOrEqual(400);
	});

	// PROTO-001's verifier flagged this test (and the equivalent one in
	// `conformance-modern.test.ts`) as a doubt worth resolving: it sends no
	// `mcp-protocol-version` header and no per-request `_meta` envelope
	// claim, and the SDK's own `isLegacyRequest` documentation is explicit
	// that a claim-less notification POST — including one with no header at
	// all — classifies as LEGACY traffic, served through the stateless
	// fallback, not the modern path. Confirmed directly (see the test right
	// after this one): the same request WITH a protocol-version header and
	// an envelope claim reaches `serveModern` instead. This test is
	// therefore renamed to say what it actually proves, and a genuine
	// modern-lane counterpart is added below.
	it('answers a bare legacy notification POST (no protocol-version header, no envelope) with 202 and an empty body', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'notifications/initialized',
			}),
		});

		expect(response.status).toBe(202);
		expect(await response.text()).toBe('');
	});

	it('answers a modern notification POST (protocol-version header + _meta envelope claim) with 202 and an empty body', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'mcp-protocol-version': '2026-07-28',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'notifications/cancelled',
				params: {
					requestId: 1,
					_meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
				},
			}),
		});

		expect(response.status).toBe(202);
		expect(await response.text()).toBe('');
	});

	it('rejects a declared oversized Content-Length before ever reaching the SDK, with a stable protocol error', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'content-length': String(10 * 1024 * 1024), // 10MB, well over the 1MB limit
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});

		expect(response.status).toBe(413);
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe('payload_too_large');
	});

	it('fails a chunked body (no Content-Length) that overflows the limit while streaming, with a stable SDK-produced protocol error', async () => {
		// No `content-length` header at all — this is the chunked-transfer
		// case. `boundRequestBody`'s streaming cap still fires once the byte
		// count crosses the limit; the SDK converts the resulting stream
		// error into its own JSON-RPC parse-error response rather than ever
		// calling the (database-touching) server factory.
		const encoder = new TextEncoder();
		const oversizedChunk = encoder.encode(
			`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"padding":"${'x'.repeat(2 * 1024 * 1024)}"}}`,
		);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(oversizedChunk);
				controller.close();
			},
		});
		const response = await handleMcpRequest(
			new Request('http://localhost:3000/mcp', {
				method: 'POST',
				headers: {
					accept: 'application/json, text/event-stream',
					'content-type': 'application/json',
				},
				body: stream,
				duplex: 'half',
			} as RequestInit),
			buildAuthInfo(),
		);

		expect(response.status).toBeGreaterThanOrEqual(400);
		const body = (await response.json()) as { jsonrpc: string; error?: { code: number } };
		expect(body.jsonrpc).toBe('2.0');
		expect(typeof body.error).toBe('object');
	});

	// Defense in depth: `mcp-routes.ts`'s `authenticateMcpUser` always
	// verifies the bearer token and builds a well-formed `extra` before ever
	// calling this function, so a caller reaching here with an `AuthInfo`
	// that fails `readMcpRequestAuthExtra`'s shape check means the HTTP
	// boundary was bypassed. This exercises that boundary condition directly
	// rather than through the two-hop `mcp-routes.ts` -> `mcp-handler.ts`
	// integration path, since `mcp-routes.ts`'s own suite already covers
	// what happens when ITS token lookup produces malformed `extra`.
	it('throws when authInfo carries no verified auth extra (missing userProfile.id)', async () => {
		const malformedAuthInfo = buildAuthInfo();
		// @ts-expect-error -- deliberately malformed to simulate a caller
		// bypassing the HTTP boundary's own shape guarantees.
		malformedAuthInfo.extra.userProfile = undefined;

		await expect(
			handleMcpRequest(
				new Request('http://localhost:3000/mcp', {
					method: 'POST',
					headers: {
						accept: 'application/json, text/event-stream',
						'content-type': 'application/json',
					},
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
				}),
				malformedAuthInfo,
			),
		).rejects.toThrow('MCP request reached the handler without verified auth context.');
	});
});

/**
 * PROTO-002 / S-11: "resource updates are broadcast to every active
 * transport instead of the authorized subscriber set" — the defect the
 * roadmap named. These tests prove the fix at the level that actually
 * matters: through `handleMcpRequest`, the production entry point, using a
 * real `@modelcontextprotocol/client` per user (not a shared connection).
 */
function makeClientFetch(userId: string) {
	return async (input: string | URL, init?: RequestInit): Promise<Response> =>
		handleMcpRequest(new Request(input, init), buildAuthInfo({ userId }));
}

async function connectModernClient(name: string, userId: string) {
	const client = new Client({ name, version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
	const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
		fetch: makeClientFetch(userId),
	});
	await client.connect(transport);
	return client;
}

describe('subscriptions/listen (PROTO-002 / S-11)', () => {
	it('advertises resources.subscribe on the modern era (real delivery now exists), unlike the legacy era', async () => {
		const modernClient = await connectModernClient('cap-test-modern', 'user-cap-modern');
		expect(modernClient.getServerCapabilities()?.resources?.subscribe).toBe(true);
		await modernClient.close();

		const legacyClient = new Client({ name: 'cap-test-legacy', version: '1.0.0' });
		const legacyTransport = new StreamableHTTPClientTransport(
			new URL('http://localhost:3000/mcp'),
			{
				fetch: makeClientFetch('user-cap-legacy'),
			},
		);
		await legacyClient.connect(legacyTransport);
		expect(legacyClient.getProtocolEra()).toBe('legacy');
		expect(legacyClient.getServerCapabilities()?.resources?.subscribe).toBeUndefined();
		await legacyClient.close();
	});

	it("never delivers user A's resource update to user B's subscriptions/listen stream, even for the identical URI", async () => {
		const clientA = await connectModernClient('s11-client-a', 'user-s11-a');
		const clientB = await connectModernClient('s11-client-b', 'user-s11-b');

		const receivedByA: string[] = [];
		const receivedByB: string[] = [];
		clientA.setNotificationHandler('notifications/resources/updated', async (notification) => {
			receivedByA.push(notification.params.uri);
		});
		clientB.setNotificationHandler('notifications/resources/updated', async (notification) => {
			receivedByB.push(notification.params.uri);
		});

		// Both users watch the exact same literal URI — this codebase's
		// `user://profile` resource is a fixed "my own profile" address, not
		// unique per user, which is exactly the shape that made the old
		// broadcast-to-every-transport bug a real cross-user leak.
		const subscriptionA = await clientA.listen({ resourceSubscriptions: ['user://profile'] });
		const subscriptionB = await clientB.listen({ resourceSubscriptions: ['user://profile'] });

		await clientA.callTool({
			name: 'test_watched_resource_update',
			arguments: { uri: 'user://profile' },
		});

		// Poll rather than a fixed sleep: the Redis pub/sub round trip is
		// asynchronous, but bounding the wait keeps the test from hanging if
		// delivery is ever broken outright.
		const deadline = Date.now() + 2000;
		while (receivedByA.length === 0 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		// Give any (incorrect) cross-user delivery a moment to arrive too.
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(receivedByA).toEqual(['user://profile']);
		expect(receivedByB).toEqual([]);

		await subscriptionA.close();
		await subscriptionB.close();
		await clientA.close();
		await clientB.close();
	});

	it('review finding (P2): publishUserResourceUpdate delivers to a live subscription on the in-memory (no-Redis) bus', async () => {
		// This whole file mocks `@web/env` with no `REDIS_URL`, so
		// `isRedisConfigured()` is false throughout — every handler here
		// already uses the in-memory `InMemoryServerEventBus` fallback,
		// exactly the deployment shape (local development, no Redis) the
		// defect was specific to.
		//
		// `publishUserResourceUpdate` is the function callers OUTSIDE the
		// request path use (e.g. `google-authentication-routes.ts` after a
		// real Google profile mutation) — it does not have a `handler`
		// closure variable to call `.notify` on the way the in-request
		// `publishResourceUpdate` callback in `createUserHandlerEntry` does.
		// Before the fix, it constructed a brand-new, disconnected
		// `InMemoryServerEventBus()` for this call, so this event never
		// reached the open subscription below.
		const client = await connectModernClient(
			'publish-update-modern',
			'user-publish-update-external',
		);
		const received: string[] = [];
		client.setNotificationHandler('notifications/resources/updated', async (notification) => {
			received.push(notification.params.uri);
		});
		const subscription = await client.listen({ resourceSubscriptions: ['user://profile'] });

		publishUserResourceUpdate('user-publish-update-external', 'user://profile');

		const deadline = Date.now() + 2000;
		while (received.length === 0 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		expect(received).toEqual(['user://profile']);

		await subscription.close();
		await client.close();
	});

	it('genuinely aborts the underlying operation on client disconnect, not just the wrapper promise (SEC-004 wiring)', async () => {
		cancellableOperationTestHooks.reset();
		const client = await connectModernClient('cancel-test', 'user-cancel');

		const controller = new AbortController();
		const callPromise = client.callTool(
			{ name: 'test_cancellable_operation', arguments: { delayMilliseconds: 500 } },
			{ signal: controller.signal },
		);
		// Let the request actually start, then abort well before the fixture's
		// own 500ms delay would resolve.
		await new Promise((resolve) => setTimeout(resolve, 50));
		controller.abort();

		await expect(callPromise).rejects.toBeDefined();

		// The discriminating assertion: wait past the fixture's full delay and
		// confirm it never completed. If cancellation only abandoned a
		// wrapper promise (the exact SEC-004 bug this wiring fixes) while the
		// real `setTimeout` kept running in the background, `completedCount`
		// would tick up to 1 here.
		await new Promise((resolve) => setTimeout(resolve, 600));
		expect(cancellableOperationTestHooks.completedCount).toBe(0);
		expect(cancellableOperationTestHooks.abortedCount).toBe(1);

		await client.close();
	});
});

/**
 * Round 17 review finding (P2). The SDK serves `subscriptions/listen`
 * outside `McpServer`'s registered-handler dispatch entirely, so
 * `assertRequiredScope` — which guards `resources/read` — is never reached
 * for a subscription. A client holding only `prompts:read` could therefore
 * subscribe to `user://profile` and receive every subsequent
 * `resource_updated` event for a resource whose scope it was never granted.
 *
 * These drive the real HTTP entry point rather than unit-testing the
 * extractor, because the defect lives in the seam between the two: an
 * extractor that reads the wrong parameter path would return an empty URI
 * list, authorize vacuously, and still pass an extractor-only test.
 */
describe('subscriptions/listen scope enforcement (round 17)', () => {
	function listenRequest(resourceSubscriptions: string[], scopes: string[]): Promise<Response> {
		return handleMcpRequest(
			new Request('http://localhost:3000/mcp', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json, text/event-stream',
					'MCP-Protocol-Version': '2026-07-28',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'subscriptions/listen',
					params: { notifications: { resourceSubscriptions } },
				}),
			}),
			buildAuthInfo({ scopes }),
		);
	}

	it('refuses a subscription to a resource whose scope the token does not carry', async () => {
		const response = await listenRequest(['user://profile'], ['prompts:read']);

		expect(response.status).toBe(403);
		expect(response.headers.get('WWW-Authenticate')).toContain('error="insufficient_scope"');
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe('forbidden');
	});

	it('refuses a token carrying no scopes at all', async () => {
		expect((await listenRequest(['user://profile'], [])).status).toBe(403);
	});

	it('refuses an unrecognized URI identically to an under-scoped one', async () => {
		// Denial must not confirm or deny that a resource exists — the same
		// collapse `resources/read` already performs.
		const unknown = await listenRequest(['user://does-not-exist'], grantedScopes);
		const underScoped = await listenRequest(['user://profile'], ['prompts:read']);

		expect(unknown.status).toBe(underScoped.status);
		expect(await unknown.json()).toEqual(await underScoped.json());
	});

	it('refuses the whole request when only one of several URIs is unauthorized', async () => {
		// Never attach the permitted subset: a caller could otherwise infer
		// per-URI authorization by observing which URIs later deliver events.
		expect((await listenRequest(['user://profile', 'user://nope'], grantedScopes)).status).toBe(
			403,
		);
	});

	it('allows a subscription the token is scoped for', async () => {
		expect((await listenRequest(['user://profile'], grantedScopes)).status).not.toBe(403);
	});

	it('allows a list-changed-only subscription, which names no resource', async () => {
		const response = await handleMcpRequest(
			new Request('http://localhost:3000/mcp', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json, text/event-stream',
					'MCP-Protocol-Version': '2026-07-28',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'subscriptions/listen',
					params: { notifications: { toolsListChanged: true } },
				}),
			}),
			buildAuthInfo({ scopes: ['prompts:read'] }),
		);

		expect(response.status).not.toBe(403);
	});

	it('leaves non-listen requests untouched by this gate', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
				'MCP-Protocol-Version': '2026-07-28',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
		});

		expect(response.status).not.toBe(403);
	});
});

/**
 * `shutdownMcpTransports` (`server.ts`'s `gracefulShutdown()` calls this
 * directly) is already proven end-to-end by
 * `graceful-shutdown.integration.test.ts`, which spawns the real server as
 * a subprocess and sends it `SIGTERM` -- but that proof runs in a separate
 * OS process, so this process's own `bun test --coverage` run never sees
 * those lines execute. This unit slice exercises the same function
 * in-process purely to prove its own two real side effects rather than
 * just "resolves without throwing": it must be safe to call more than once
 * (the real shutdown path can retry), and afterward the per-user handler
 * cache it clears must be usable again by a fresh request for a user who
 * had a live handler before shutdown -- not left in a broken state that
 * only a process restart could recover from.
 *
 * IMPORTANT: this test is deliberately the LAST test in this file.
 * `shutdownMcpTransports` mutates this module's shared, process-wide
 * `userHandlers` cache and its sweep timer, so running it earlier would
 * affect every later test's handler/bus state.
 */
describe('shutdownMcpTransports (OPS-001 unit slice)', () => {
	it('is safe to call more than once, and a user whose handler existed before shutdown can still connect and receive updates afterward', async () => {
		const userId = 'user-shutdown-unit-slice';
		const clientBeforeShutdown = await connectModernClient('shutdown-before', userId);
		const subscriptionBeforeShutdown = await clientBeforeShutdown.listen({
			resourceSubscriptions: ['user://profile'],
		});

		await shutdownMcpTransports();
		// Idempotent: a second call must not throw (the real shutdown path
		// can call this more than once under retry/timeout conditions).
		expect(await shutdownMcpTransports()).toBeUndefined();

		// The client's own `.close()` after its handler was already closed
		// server-side must not throw either.
		expect(await subscriptionBeforeShutdown.close()).toBeUndefined();
		await clientBeforeShutdown.close();

		// A fresh connection for the SAME user id, after shutdown, must get a
		// working handler -- not reuse (and fail against) a closed one.
		const clientAfterShutdown = await connectModernClient('shutdown-after', userId);
		const received: string[] = [];
		clientAfterShutdown.setNotificationHandler(
			'notifications/resources/updated',
			async (notification) => {
				received.push(notification.params.uri);
			},
		);
		const subscriptionAfterShutdown = await clientAfterShutdown.listen({
			resourceSubscriptions: ['user://profile'],
		});

		await clientAfterShutdown.callTool({
			name: 'test_watched_resource_update',
			arguments: { uri: 'user://profile' },
		});

		const deadline = Date.now() + 2000;
		while (received.length === 0 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		expect(received).toEqual(['user://profile']);

		await subscriptionAfterShutdown.close();
		await clientAfterShutdown.close();
	});
});
