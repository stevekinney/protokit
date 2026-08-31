import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { deleteTestAccounts } from '@web/test-support/delete-test-accounts';
import { fetchFromTestServer, startTestServer } from '@web/test-support/start-test-server';
import type { TestServerHandle } from '@web/test-support/start-test-server';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';

/**
 * OAUTH-002: this is the only fetch a Client ID Metadata Document flow
 * needs to reach in these tests, and it never needs to be a real network
 * call — the flow under test is "does this server upsert a row and honor
 * it correctly given a validated document", not "can it reach the public
 * internet". `client-metadata-documents.test.ts` covers the fetch/SSRF/
 * schema-validation logic itself, exhaustively, with injected dependencies
 * on that module directly. Mocked at module scope before `@web/application`
 * is imported below, and this file runs under `bun test --isolate`
 * (`test:oauth:interop`), so this never leaks into another test file.
 */
type MockedCimdDocument = {
	clientId: string;
	clientName: string;
	redirectUris: string[];
	grantTypes: string[];
	responseTypes: string[];
	applicationType: string | null;
};
const mockCimdState: { document: MockedCimdDocument | null } = { document: null };
mock.module('@lostgradient/mcp/oauth/client-metadata-documents', () => ({
	isClientIdMetadataDocumentUrl: (clientId: string) => {
		try {
			const parsed = new URL(clientId);
			return parsed.protocol === 'https:' && parsed.pathname !== '' && parsed.pathname !== '/';
		} catch {
			return false;
		}
	},
	fetchClientIdMetadataDocument: async (clientId: string) =>
		mockCimdState.document?.clientId === clientId ? mockCimdState.document : null,
}));

const { handleApplicationRequest } = await import('@web/application');
const { createSession } = await import('@web/lib/session-authentication');

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

// OPEN-3: same stale-rate-limit-key flush this file's siblings already do —
// this file drives several real authorize/approve/token round trips keyed
// by network identity.
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

// RFC 7636 Appendix B's worked example pair, reused across this suite.
const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const testRunId = randomUUID();
const userId = randomUUID();
const insertedClientIds: string[] = [];

beforeAll(async () => {
	await database.insert(schema.users).values({
		id: userId,
		email: `connector-registration-interop-test-${testRunId}@example.com`,
		name: 'Connector Registration Interop Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
});

afterAll(async () => {
	// One statement per entity instead of one per table: `DATA-001` cascades
	// every child row from `users` and `oauth_clients`, and each extra statement
	// is an HTTP round trip through the local Neon proxy — enough of them
	// overran the 5s hook budget on a continuous-integration runner. See
	// `test-support/delete-test-accounts.ts`.
	await deleteTestAccounts({ clientIds: insertedClientIds, userIds: [userId] });
});

async function signIn(handle: TestServerHandle): Promise<string> {
	const session = await createSession({
		userId,
		request: new Request(`http://127.0.0.1:${handle.port}/`),
	});
	return session.cookieHeaderValue.split(';')[0]!;
}

describeWithRedis('public client registration and refresh rotation (requires Redis)', () => {
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
	it('OAUTH-002: a DCR public client (auth_method none) gets no secret, completes PKCE, rotates its refresh token exactly once, and cannot replay it', async () => {
		const handle = startServer();

		const registerResponse = await fetchFromTestServer(handle, `/oauth/register`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				client_name: 'Public Connector Interop Test Client',
				redirect_uris: ['https://example.com/callback'],
				grant_types: ['authorization_code', 'refresh_token'],
				token_endpoint_auth_method: 'none',
			}),
		});
		expect(registerResponse.status).toBe(201);
		const registration = (await registerResponse.json()) as {
			client_id: string;
			client_secret?: string;
			token_endpoint_auth_method: string;
		};
		expect(registration.client_secret).toBeUndefined();
		expect(registration.token_endpoint_auth_method).toBe('none');
		const publicClientId = registration.client_id;
		insertedClientIds.push(publicClientId);

		const cookie = await signIn(handle);
		const resource = `http://127.0.0.1:${handle.port}/mcp`;

		const consentResponse = await fetchFromTestServer(
			handle,
			`/oauth/authorize?client_id=${publicClientId}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=${codeChallenge}&resource=${encodeURIComponent(resource)}`,
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
		const code = new URL(approveResponse.headers.get('location')!).searchParams.get('code')!;

		// Public client: no client_secret on the token request either.
		const tokenResponse = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: 'https://example.com/callback',
				client_id: publicClientId,
				code_verifier: codeVerifier,
				resource,
			}).toString(),
		});
		expect(tokenResponse.status).toBe(200);
		const firstTokens = (await tokenResponse.json()) as {
			access_token: string;
			refresh_token: string;
		};
		expect(firstTokens.refresh_token.length).toBeGreaterThan(0);

		const mcpResponse = await fetchFromTestServer(handle, `/mcp`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${firstTokens.access_token}`,
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});
		expect(mcpResponse.status).not.toBe(401);

		// Rotate once.
		const refreshResponse = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: firstTokens.refresh_token,
				client_id: publicClientId,
				resource,
			}).toString(),
		});
		expect(refreshResponse.status).toBe(200);
		const secondTokens = (await refreshResponse.json()) as {
			access_token: string;
			refresh_token: string;
		};
		expect(secondTokens.refresh_token).not.toBe(firstTokens.refresh_token);
		expect(secondTokens.access_token).not.toBe(firstTokens.access_token);

		// Replaying the original (now-rotated) refresh token must fail.
		const replayResponse = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: firstTokens.refresh_token,
				client_id: publicClientId,
				resource,
			}).toString(),
		});
		expect(replayResponse.status).toBe(400);
		const replayBody = (await replayResponse.json()) as { error: string };
		expect(replayBody.error).toBe('invalid_grant');
	}, 30_000);
});

describeWithRedis('Client ID Metadata Document registration (requires Redis)', () => {
	it('OAUTH-002: a valid CIMD document is fetched, validated, and upserted, and the resulting client can complete the full chain', async () => {
		const handle = startServer();
		const clientIdUrl = `https://cimd-interop-test.example.com/client-${testRunId}.json`;
		mockCimdState.document = {
			clientId: clientIdUrl,
			clientName: 'CIMD Interop Test Client',
			redirectUris: ['https://example.com/callback'],
			grantTypes: ['authorization_code', 'refresh_token'],
			responseTypes: ['code'],
			applicationType: null,
		};
		insertedClientIds.push(clientIdUrl);

		const cookie = await signIn(handle);
		const resource = `http://127.0.0.1:${handle.port}/mcp`;

		const consentResponse = await fetchFromTestServer(
			handle,
			`/oauth/authorize?client_id=${encodeURIComponent(clientIdUrl)}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=${codeChallenge}&resource=${encodeURIComponent(resource)}`,
			{ headers: { cookie } },
		);
		expect(consentResponse.status).toBe(200);
		const html = await consentResponse.text();
		expect(html).toContain('CIMD Interop Test Client');

		const [upsertedClient] = await database
			.select()
			.from(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, clientIdUrl))
			.limit(1);
		expect(upsertedClient).toBeDefined();
		expect(upsertedClient?.clientSecret).toBeNull();
		expect(upsertedClient?.tokenEndpointAuthMethod).toBe('none');
		expect(upsertedClient?.clientType).toBe('public');
		expect(upsertedClient?.clientIdMetadataUrl).toBe(clientIdUrl);

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
		const code = new URL(approveResponse.headers.get('location')!).searchParams.get('code')!;

		const tokenResponse = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: 'https://example.com/callback',
				client_id: clientIdUrl,
				code_verifier: codeVerifier,
				resource,
			}).toString(),
		});
		expect(tokenResponse.status).toBe(200);
		const tokens = (await tokenResponse.json()) as { access_token: string };

		const mcpResponse = await fetchFromTestServer(handle, `/mcp`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${tokens.access_token}`,
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});
		expect(mcpResponse.status).not.toBe(401);
	});

	it('OAUTH-002: an unfetchable/invalid Client ID Metadata Document creates no client row', async () => {
		const handle = startServer();
		const clientIdUrl = `https://cimd-interop-test.example.com/nonexistent-${testRunId}.json`;
		mockCimdState.document = null;

		const cookie = await signIn(handle);
		const resource = `http://127.0.0.1:${handle.port}/mcp`;
		const response = await fetchFromTestServer(
			handle,
			`/oauth/authorize?client_id=${encodeURIComponent(clientIdUrl)}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=${codeChallenge}&resource=${encodeURIComponent(resource)}`,
			{ headers: { cookie } },
		);
		expect(response.status).toBe(400);
		const body = await response.text();
		expect(body).toContain('Unknown OAuth client');

		const rows = await database
			.select()
			.from(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, clientIdUrl))
			.limit(1);
		expect(rows).toHaveLength(0);
	});
});
