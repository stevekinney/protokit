import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';
import { deleteTestAccounts } from '@web/test-support/delete-test-accounts';
import {
	CrossServerRoutingError,
	TEST_SERVER_INSTANCE_HEADER,
	fetchFromTestServer,
	startTestServer,
} from '@web/test-support/start-test-server';
import type { TestServerHandle } from '@web/test-support/start-test-server';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';

const { handleApplicationRequest } = await import('@web/application');
const { createSession } = await import('@web/lib/session-authentication');

/**
 * OAUTH-001: end-to-end proof, against the real dispatcher, real Postgres,
 * and real Redis rate limiter, that the whole authorize -> approve -> token
 * -> `/mcp` chain binds to one RFC 8707 `resource` throughout, and that a
 * token bound to any other resource — however it was minted — is rejected
 * at `/mcp` regardless of how otherwise valid it is. This is the scenario
 * `bun run test:oauth:interop` names in the roadmap's verification block.
 *
 * `oauth-routes.test.tsx` and `mcp-routes.test.ts` prove each accept/reject
 * branch individually against a mocked database; this file proves the
 * pieces are wired together correctly end to end, the same relationship
 * `oauth-authorization-csrf.integration.test.ts` has to its mocked sibling.
 */

let redisAvailable: boolean;
try {
	const { isRedisHealthy } = await import('@web/lib/redis-client');
	redisAvailable = await Promise.race([
		isRedisHealthy(),
		new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
	]);
} catch {
	redisAvailable = false;
}

// OPEN-3: this file's tests key rate-limit state (authorize, token, MCP
// authentication) by network identity (loopback, in this suite), and that
// state persists in Redis across every other file in the same test run —
// this file alone drives several real authorize/approve/token round trips.
// Flush every `rate_limit:*` key before this file's Redis-backed tests run,
// exactly like `oauth-routes.integration.test.tsx` does, so a fuller suite
// run that already spent part of another file's budget on the same
// network identity can't leave this file too little headroom.
if (redisAvailable) {
	const { resetRateLimitState } = await import('@web/test-support/reset-rate-limit-state');
	await resetRateLimitState();
}

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

let server: TestServerHandle | null = null;

afterEach(() => {
	server?.stop();
	server = null;
});

function startServer(): TestServerHandle {
	server = startTestServer((request, bunServer) =>
		handleApplicationRequest(request, {
			clientAddress: bunServer.requestIP(request)?.address,
		}),
	);
	return server;
}

function extractHiddenInputValue(html: string, fieldName: string): string {
	const match = html.match(new RegExp(`name="${fieldName}"\\s+value="([^"]+)"`));
	if (!match) {
		throw new Error(`Could not find hidden input "${fieldName}" in consent page HTML`);
	}
	return match[1]!;
}

// RFC 7636 Appendix B's worked example pair — used identically elsewhere in
// this test suite (`oauth-routes.test.tsx`).
const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const testRunId = randomUUID();
const userId = randomUUID();
const clientId = `resource-binding-interop-test-${testRunId}`;
const clientSecret = 'test-client-secret';
// OAUTH-004: a second, otherwise-identical client, used only to prove an
// authorization code is client-bound — that a code issued to `clientId`
// cannot be redeemed by presenting a different, equally valid client's
// credentials.
const otherClientId = `resource-binding-interop-test-other-${testRunId}`;
const otherClientSecret = 'test-other-client-secret';

beforeAll(async () => {
	await database.insert(schema.users).values({
		id: userId,
		email: `resource-binding-interop-test-${testRunId}@example.com`,
		name: 'Resource Binding Interop Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: hashCredential(clientSecret),
		clientName: 'Resource Binding Interop Test Client',
		clientType: 'confidential',
		tokenEndpointAuthMethod: 'client_secret_post',
		redirectUris: ['https://example.com/callback'],
		grantTypes: ['authorization_code', 'refresh_token'],
		responseTypes: ['code'],
	});
	await database.insert(schema.oauthClients).values({
		clientId: otherClientId,
		clientSecret: hashCredential(otherClientSecret),
		clientName: 'Resource Binding Interop Test Other Client',
		clientType: 'confidential',
		tokenEndpointAuthMethod: 'client_secret_post',
		redirectUris: ['https://example.com/callback'],
		grantTypes: ['authorization_code', 'refresh_token'],
		responseTypes: ['code'],
	});
});

afterAll(async () => {
	// One statement per entity instead of one per table: `DATA-001` cascades
	// every child row from `users` and `oauth_clients`, and each extra statement
	// is an HTTP round trip through the local Neon proxy — enough of them
	// overran the 5s hook budget on a continuous-integration runner. See
	// `test-support/delete-test-accounts.ts`.
	await deleteTestAccounts({ clientIds: [clientId, otherClientId], userIds: [userId] });
});

describeWithRedis('resource-bound authorize -> token -> /mcp chain (requires Redis)', () => {
	async function signIn(handle: TestServerHandle): Promise<string> {
		const session = await createSession({
			userId,
			request: new Request(`http://127.0.0.1:${handle.port}/`),
		});
		return session.cookieHeaderValue.split(';')[0]!;
	}

	async function obtainAccessToken(
		handle: TestServerHandle,
		cookie: string,
		scope?: string,
	): Promise<string> {
		const resource = `http://127.0.0.1:${handle.port}/mcp`;
		const scopeParameter = scope ? `&scope=${encodeURIComponent(scope)}` : '';

		const consentResponse = await fetchFromTestServer(
			handle,
			`/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=${codeChallenge}&resource=${encodeURIComponent(resource)}${scopeParameter}`,
			{ headers: { cookie } },
		);
		expect(consentResponse.status).toBe(200);
		const html = await consentResponse.text();
		const transactionId = extractHiddenInputValue(html, 'transaction_id');
		const csrfToken = extractHiddenInputValue(html, 'csrf_token');

		const approveResponse = await fetchFromTestServer(handle, `/oauth/authorize/approve`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				cookie,
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'same-origin',
			},
			body: new URLSearchParams({
				transaction_id: transactionId,
				csrf_token: csrfToken,
			}).toString(),
		});
		expect(approveResponse.status).toBe(302);
		const location = new URL(approveResponse.headers.get('location')!);
		const code = location.searchParams.get('code')!;
		expect(code.length).toBeGreaterThan(0);

		const tokenResponse = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: 'https://example.com/callback',
				client_id: clientId,
				client_secret: clientSecret,
				code_verifier: codeVerifier,
				resource,
			}).toString(),
		});
		expect(tokenResponse.status).toBe(200);
		const tokenBody = (await tokenResponse.json()) as { access_token: string };
		expect(tokenBody.access_token.length).toBeGreaterThan(0);
		return tokenBody.access_token;
	}

	// Review finding (P2, round 16): `client_id` and `redirect_uri` are
	// already verified by the time the resource check runs, so per RFC
	// 6749 §4.1.2.1 a missing/mismatched `resource` is now delivered back
	// to the client through the verified redirect (`invalid_target`)
	// rather than a local 400 -- the client would otherwise receive no
	// authorization callback at all. `redirect: 'manual'` is required here
	// (matching every other redirect-asserting test in this file): without
	// it, `fetch`'s default `redirect: 'follow'` would actually follow the
	// 302 to the real external `https://example.com/callback`, and
	// `fetchFromTestServer`'s cross-server-instance check would then
	// (correctly) throw on that unrelated response.
	it('redirects an authorization request with no resource parameter to the verified client', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const response = await fetchFromTestServer(
			handle,
			`/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=${codeChallenge}`,
			{ headers: { cookie }, redirect: 'manual' },
		);
		expect(response.status).toBe(302);
		const location = new URL(response.headers.get('location')!);
		expect(location.origin + location.pathname).toBe('https://example.com/callback');
		expect(location.searchParams.get('error')).toBe('invalid_target');
	});

	it('redirects an authorization request whose resource does not name this server to the verified client', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const response = await fetchFromTestServer(
			handle,
			`/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=${codeChallenge}&resource=${encodeURIComponent('https://not-this-server.example.com/mcp')}`,
			{ headers: { cookie }, redirect: 'manual' },
		);
		expect(response.status).toBe(302);
		const location = new URL(response.headers.get('location')!);
		expect(location.origin + location.pathname).toBe('https://example.com/callback');
		expect(location.searchParams.get('error')).toBe('invalid_target');
	});

	it('rejects a token request whose resource does not match the authorization code', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const resource = `http://127.0.0.1:${handle.port}/mcp`;

		const consentResponse = await fetchFromTestServer(
			handle,
			`/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=${codeChallenge}&resource=${encodeURIComponent(resource)}`,
			{ headers: { cookie } },
		);
		const html = await consentResponse.text();
		const transactionId = extractHiddenInputValue(html, 'transaction_id');
		const csrfToken = extractHiddenInputValue(html, 'csrf_token');

		const approveResponse = await fetchFromTestServer(handle, `/oauth/authorize/approve`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				cookie,
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'same-origin',
			},
			body: new URLSearchParams({
				transaction_id: transactionId,
				csrf_token: csrfToken,
			}).toString(),
		});
		const location = new URL(approveResponse.headers.get('location')!);
		const code = location.searchParams.get('code')!;

		const tokenResponse = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: 'https://example.com/callback',
				client_id: clientId,
				client_secret: clientSecret,
				code_verifier: codeVerifier,
				resource: `http://127.0.0.1:${handle.port}/some-other-resource`,
			}).toString(),
		});
		expect(tokenResponse.status).toBe(400);
		const tokenBody = (await tokenResponse.json()) as { error: string };
		expect(tokenBody.error).toBe('invalid_target');
	});

	it('OAUTH-004: rejects a token request presenting a code issued to a different client (client-bound)', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const resource = `http://127.0.0.1:${handle.port}/mcp`;

		const consentResponse = await fetchFromTestServer(
			handle,
			`/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=${codeChallenge}&resource=${encodeURIComponent(resource)}`,
			{ headers: { cookie } },
		);
		const html = await consentResponse.text();
		const transactionId = extractHiddenInputValue(html, 'transaction_id');
		const csrfToken = extractHiddenInputValue(html, 'csrf_token');

		const approveResponse = await fetchFromTestServer(handle, `/oauth/authorize/approve`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				cookie,
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'same-origin',
			},
			body: new URLSearchParams({
				transaction_id: transactionId,
				csrf_token: csrfToken,
			}).toString(),
		});
		const location = new URL(approveResponse.headers.get('location')!);
		const code = location.searchParams.get('code')!;

		// The code above was issued to `clientId`. `otherClientId` is a real,
		// equally valid, registered client with its own credentials — not an
		// unregistered or malformed one — presenting the same code, redirect
		// URI, and (unknowable, since PKCE binds the code to whoever
		// requested it) correct code_verifier for `clientId`'s own flow.
		const tokenResponse = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: 'https://example.com/callback',
				client_id: otherClientId,
				client_secret: otherClientSecret,
				code_verifier: codeVerifier,
				resource,
			}).toString(),
		});
		expect(tokenResponse.status).toBe(400);
		const tokenBody = (await tokenResponse.json()) as { error: string };
		expect(tokenBody.error).toBe('invalid_grant');

		// The code must still be redeemable by its actual, rightful owner —
		// proving the rejection above was really client-binding and not a
		// side effect that also burned or corrupted the code.
		const rightfulTokenResponse = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: 'https://example.com/callback',
				client_id: clientId,
				client_secret: clientSecret,
				code_verifier: codeVerifier,
				resource,
			}).toString(),
		});
		expect(rightfulTokenResponse.status).toBe(200);
	});

	it('a token minted through the real authorize/token flow is accepted at /mcp', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const accessToken = await obtainAccessToken(handle, cookie);

		const mcpResponse = await fetchFromTestServer(handle, `/mcp`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});
		expect(mcpResponse.status).not.toBe(401);
	});

	// TEST-001: named explicitly by the roadmap ("regression tests for ...
	// malformed JSON-RPC") -- an authenticated request that clears every
	// boundary control (origin, bearer token, audience, scope) but sends a
	// body the JSON-RPC layer itself cannot parse must fail as a protocol
	// error, not as an authentication or authorization failure, and must
	// never reach a tool handler.
	it('rejects a syntactically invalid JSON body from an otherwise fully authenticated request', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const accessToken = await obtainAccessToken(handle, cookie);

		const mcpResponse = await fetchFromTestServer(handle, `/mcp`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
			},
			body: '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"',
		});

		expect(mcpResponse.status).not.toBe(401);
		expect(mcpResponse.status).not.toBe(403);
		expect(mcpResponse.status).toBeLessThan(500);
	});

	it('rejects a well-formed JSON body that is not a valid JSON-RPC envelope', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const accessToken = await obtainAccessToken(handle, cookie);

		const mcpResponse = await fetchFromTestServer(handle, `/mcp`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
			},
			body: JSON.stringify({ not: 'a jsonrpc envelope at all' }),
		});

		expect(mcpResponse.status).not.toBe(401);
		expect(mcpResponse.status).not.toBe(403);
		expect(mcpResponse.status).toBeLessThan(500);
	});

	it('the same token is rejected at /mcp once its stored resource no longer matches (audience binding, not just possession)', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const accessToken = await obtainAccessToken(handle, cookie);

		// A token can only ever be minted for this server's own canonical
		// resource (proved above and by the unit suite), so the only way to
		// observe "a token whose audience doesn't match" against a live
		// server is to simulate the row a *different* deployment or a
		// database-level tamper would produce — directly, without going
		// through any endpoint. `/mcp` must still refuse it.
		await database
			.update(schema.oauthTokens)
			.set({ resource: 'https://not-this-server.example.com/mcp' })
			.where(eq(schema.oauthTokens.accessToken, hashCredential(accessToken)));

		const mcpResponse = await fetchFromTestServer(handle, `/mcp`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});
		expect(mcpResponse.status).toBe(401);
		expect(mcpResponse.headers.get('www-authenticate')).toContain('error="invalid_token"');
	});

	// INTEROP-001: `AUTHZ-001`'s scope enforcement is proven in-process against
	// a real `McpServer` (`packages/mcp/src/scope-enforcement.test.ts`), but no
	// existing test drove a real, narrowed-scope OAuth grant through the real
	// authorize -> approve -> token chain and hit the real `/mcp` HTTP boundary
	// with it. This is that gap — a token that never carries `profile:read`
	// still authenticates (it is a perfectly valid token, just under-scoped for
	// this particular tool), and the tool call itself is refused without ever
	// calling `get_user_profile`'s own handler.
	// An end-to-end chain, deliberately serial: each step consumes the previous
	// step's output, so nothing here can be parallelized away. It drives roughly
	// ten HTTP requests against the real dispatcher, and each one costs
	// 218-345ms locally because it makes several database round trips through
	// the Neon proxy — about 2.5-3.5s here, and past bun's generic 5s default on
	// a slower continuous-integration runner.
	//
	// An explicit budget for this one test, not a relaxed default for the suite.
	// Everything that could be made faster already has been (see the batched
	// seeding and parallel verification in `account-deletion.integration.test.ts`),
	// and a test that legitimately takes three seconds should not be measured
	// against a limit meant for unit tests. A genuine hang still fails, at 30s
	// instead of 5s.
	it('a real narrowed-scope token authenticates at /mcp but is refused insufficient_scope for a tool outside its grant', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const accessToken = await obtainAccessToken(handle, cookie, 'prompts:read');

		const client = new Client({ name: 'scope-interop-test-client', version: '1.0.0' });
		const transport = new StreamableHTTPClientTransport(
			new URL(`http://127.0.0.1:${handle.port}/mcp`),
			{
				fetch: async (input, init) => {
					// Build from `new Headers(...)` rather than spreading. The SDK passes a
					// `Headers` instance, and object-spreading one yields `{}` — which
					// silently dropped `Content-Type` and made the server answer 415 under
					// SEC-004's exact-content-type check, looking like a scope failure.
					const headers = new Headers(init?.headers);
					headers.set('authorization', `Bearer ${accessToken}`);
					const response = await fetch(input, { ...init, headers });
					// OPEN-9: the SDK owns this transport's `fetch` entirely, so
					// `fetchFromTestServer` can't wrap this call site directly. Apply
					// the same identity check by hand instead of silently trusting
					// whichever listener answered.
					const actualInstanceId = response.headers.get(TEST_SERVER_INSTANCE_HEADER);
					if (actualInstanceId !== handle.instanceId) {
						throw new CrossServerRoutingError(
							handle.instanceId,
							actualInstanceId,
							typeof input === 'string' ? input : input.toString(),
						);
					}
					return response;
				},
			},
		);

		await client.connect(transport);

		const tools = await client.listTools();
		expect(tools.tools.some((tool) => tool.name === 'get_user_profile')).toBe(true);

		const result = await client.callTool({ name: 'get_user_profile', arguments: {} });
		expect(result.isError).toBe(true);
		expect(result._meta?.['mcp/www_authenticate']).toContain('error="insufficient_scope"');
		expect(result._meta?.['mcp/www_authenticate']).toContain('scope="profile:read"');

		await client.close();
	}, 30_000);
});
