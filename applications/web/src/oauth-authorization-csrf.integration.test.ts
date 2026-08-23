import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';
import { deleteTestAccounts } from '@web/test-support/delete-test-accounts';
import { fetchFromTestServer, startTestServer } from '@web/test-support/start-test-server';
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
 * SEC-005 / S-09: end-to-end proof, against the real dispatcher, real
 * Postgres, and real Redis rate limiter, that the consent approve/deny
 * forms are bound to a one-time server-side transaction and that a
 * cross-site request cannot approve or deny on a signed-in user's behalf.
 * `oauth-routes.test.tsx` proves the same properties against a mocked
 * database for every accept/reject branch individually; this file proves
 * the pieces are wired together correctly in the real request path.
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

const testRunId = randomUUID();
const userId = randomUUID();
const clientId = `csrf-integration-test-${testRunId}`;

beforeAll(async () => {
	await database.insert(schema.users).values({
		id: userId,
		email: `csrf-integration-test-${testRunId}@example.com`,
		name: 'CSRF Integration Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: hashCredential('test-client-secret'),
		clientName: 'CSRF Integration Test Client',
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
	await deleteTestAccounts({ clientIds: [clientId], userIds: [userId] });
});

describeWithRedis('OAuth consent CSRF and transaction binding (requires Redis)', () => {
	async function signIn(handle: TestServerHandle): Promise<string> {
		const session = await createSession({
			userId,
			request: new Request(`http://127.0.0.1:${handle.port}/`),
		});
		return session.cookieHeaderValue.split(';')[0]!;
	}

	// The `resource` query parameter is an OAuth RFC 8707 resource
	// identifier, not a fetch target -- it must literally contain this
	// server instance's own port (the transaction later validates that the
	// minted token's audience matches the resource that was authorized), so
	// it stays a bare `handle.port` interpolation. Only the request itself
	// goes through `fetchFromTestServer`, which is what applies OPEN-9's
	// identity check.
	async function getConsentPage(
		handle: TestServerHandle,
		cookie: string,
	): Promise<{ transactionId: string; csrfToken: string }> {
		const response = await fetchFromTestServer(
			handle,
			`/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://127.0.0.1:${handle.port}/mcp`,
			{ headers: { cookie } },
		);
		expect(response.status).toBe(200);
		const html = await response.text();
		return {
			transactionId: extractHiddenInputValue(html, 'transaction_id'),
			csrfToken: extractHiddenInputValue(html, 'csrf_token'),
		};
	}

	it('editing the transaction id in the approve form is rejected and issues no code', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const { csrfToken } = await getConsentPage(handle, cookie);

		const response = await fetchFromTestServer(handle, `/oauth/authorize/approve`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				cookie,
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'same-origin',
			},
			body: new URLSearchParams({
				transaction_id: 'a-forged-transaction-id-that-was-never-issued',
				csrf_token: csrfToken,
			}).toString(),
		});
		expect(response.status).toBe(400);
	});

	it('editing the csrf token in the approve form is rejected and issues no code', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const { transactionId } = await getConsentPage(handle, cookie);

		const response = await fetchFromTestServer(handle, `/oauth/authorize/approve`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				cookie,
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'same-origin',
			},
			body: new URLSearchParams({
				transaction_id: transactionId,
				csrf_token: 'a-forged-csrf-token',
			}).toString(),
		});
		expect(response.status).toBe(400);
	});

	it('a cross-site approve request is rejected even with the correct transaction id and csrf token', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const { transactionId, csrfToken } = await getConsentPage(handle, cookie);

		const response = await fetchFromTestServer(handle, `/oauth/authorize/approve`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				cookie,
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'cross-site',
			},
			body: new URLSearchParams({
				transaction_id: transactionId,
				csrf_token: csrfToken,
			}).toString(),
		});
		expect(response.status).toBe(403);
	});

	it('approving with the exact issued transaction id and csrf token succeeds exactly once', async () => {
		const handle = startServer();
		const cookie = await signIn(handle);
		const { transactionId, csrfToken } = await getConsentPage(handle, cookie);

		const firstResponse = await fetchFromTestServer(handle, `/oauth/authorize/approve`, {
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
		expect(firstResponse.status).toBe(302);
		const location = firstResponse.headers.get('location')!;
		expect(location.startsWith('https://example.com/callback?code=')).toBe(true);

		// Replaying the identical, already-consumed form is rejected.
		const secondResponse = await fetchFromTestServer(handle, `/oauth/authorize/approve`, {
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
		expect(secondResponse.status).toBe(400);
	});
});
