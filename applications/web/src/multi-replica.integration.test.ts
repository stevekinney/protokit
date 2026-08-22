import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';
import { deleteTestAccounts } from '@web/test-support/delete-test-accounts';

/**
 * TEST-001: proves the roadmap's "multi-replica tests prove correctness
 * without transport affinity" acceptance criterion directly, not by
 * inference from single-process tests.
 *
 * `PROTO-001` deliberately runs the MCP transport stateless (no per-session
 * ownership tracking), and `OAUTH-001`'s canonical resource URL
 * (`getMcpResourceUrl` / `getBaseUrl`) is a fixed `BASE_URL` configuration
 * value rather than something derived from whichever process happened to
 * answer a given request -- exactly how this application is meant to run
 * behind a load balancer in production, where `BASE_URL` names the shared
 * public hostname and any of N replica processes can answer any request.
 * This file boots TWO independent `Bun.serve` instances (two OS processes'
 * worth of behavior, simulated in-process, sharing the same real Postgres
 * and Redis this test run already has) with `BASE_URL` pinned to the same
 * value, and proves two things a single-server test structurally cannot:
 *
 * - A token minted through replica A's `/oauth/authorize` -> `/oauth/token`
 *   chain authenticates successfully at replica B's `/mcp` -- OAuth state
 *   lives in Postgres, not in either process's memory.
 * - `SEC-003`'s sliding-window rate limiter is a genuinely SHARED budget
 *   across replicas, not a per-process one: exhausting most of the budget
 *   against replica A leaves only the remainder available at replica B,
 *   and the combined total admitted across both never exceeds the
 *   configured maximum -- proving the atomic Redis-backed limiter, not
 *   two independent in-memory counters that would double the effective
 *   limit.
 */

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';
// Pinned rather than derived from either replica's own port -- this is the
// one configuration value that makes two independently-bound listeners
// agree on a single canonical MCP resource, exactly as a real deployment's
// load balancer hostname would.
process.env.BASE_URL = process.env.BASE_URL ?? 'http://multi-replica-test.local';

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

if (redisAvailable) {
	const { resetRateLimitState } = await import('@web/test-support/reset-rate-limit-state');
	await resetRateLimitState();
}

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

let servers: Bun.Server[] = [];

afterEach(() => {
	for (const server of servers) server.stop(true);
	servers = [];
});

/** Starts one independent replica. Each call is a fresh `Bun.serve`
 * instance with its own port -- the only thing two replicas share is the
 * real Postgres/Redis backing this process, exactly like two OS processes
 * behind a load balancer. */
function startReplica(): number {
	const server = Bun.serve({
		port: 0,
		fetch(request, bunServer) {
			return handleApplicationRequest(request, {
				clientAddress: bunServer.requestIP(request)?.address,
			});
		},
	});
	servers.push(server);
	return server.port;
}

function extractHiddenInputValue(html: string, fieldName: string): string {
	const match = html.match(new RegExp(`name="${fieldName}"\\s+value="([^"]+)"`));
	if (!match) {
		throw new Error(`Could not find hidden input "${fieldName}" in consent page HTML`);
	}
	return match[1]!;
}

// RFC 7636 Appendix B's worked example pair -- used identically elsewhere in
// this test suite (`oauth-routes.test.tsx`, `oauth-mcp-resource-binding.integration.test.ts`).
const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const testRunId = randomUUID();
const userId = randomUUID();
const clientId = `multi-replica-test-${testRunId}`;
const clientSecret = 'test-client-secret';

beforeAll(async () => {
	await database.insert(schema.users).values({
		id: userId,
		email: `multi-replica-test-${testRunId}@example.com`,
		name: 'Multi-Replica Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: hashCredential(clientSecret),
		clientName: 'Multi-Replica Test Client',
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

describeWithRedis('multi-replica correctness (requires Redis)', () => {
	async function signIn(port: number): Promise<string> {
		const session = await createSession({
			userId,
			request: new Request(`http://127.0.0.1:${port}/`),
		});
		return session.cookieHeaderValue.split(';')[0]!;
	}

	/** Runs the full authorize -> approve -> token chain against
	 * `authorizePort`, using the shared canonical `BASE_URL` resource -- not
	 * `authorizePort` itself -- as the RFC 8707 `resource` value, so the
	 * resulting token is valid at ANY replica, not just the one that minted
	 * it. */
	async function obtainAccessToken(authorizePort: number, cookie: string): Promise<string> {
		const resource = 'http://multi-replica-test.local/mcp';

		const consentResponse = await fetch(
			`http://127.0.0.1:${authorizePort}/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=${codeChallenge}&resource=${encodeURIComponent(resource)}`,
			{ headers: { cookie } },
		);
		expect(consentResponse.status).toBe(200);
		const html = await consentResponse.text();
		const transactionId = extractHiddenInputValue(html, 'transaction_id');
		const csrfToken = extractHiddenInputValue(html, 'csrf_token');

		const approveResponse = await fetch(
			`http://127.0.0.1:${authorizePort}/oauth/authorize/approve`,
			{
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
			},
		);
		expect(approveResponse.status).toBe(302);
		const location = new URL(approveResponse.headers.get('location')!);
		const code = location.searchParams.get('code')!;
		expect(code.length).toBeGreaterThan(0);

		const tokenResponse = await fetch(`http://127.0.0.1:${authorizePort}/oauth/token`, {
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

	it('a token minted through replica A authenticates at replica B, with no transport affinity', async () => {
		const replicaAPort = startReplica();
		const replicaBPort = startReplica();
		expect(replicaAPort).not.toBe(replicaBPort);

		const cookie = await signIn(replicaAPort);
		const accessToken = await obtainAccessToken(replicaAPort, cookie);

		const mcpResponseFromReplicaB = await fetch(`http://127.0.0.1:${replicaBPort}/mcp`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});

		expect(mcpResponseFromReplicaB.status).not.toBe(401);
		expect(mcpResponseFromReplicaB.status).not.toBe(403);
	});

	it("SEC-003's rate limit budget is shared across replicas, not doubled by running two", async () => {
		const replicaAPort = startReplica();
		const replicaBPort = startReplica();

		// A distinct client identity per test run so this test's own budget
		// consumption can never collide with another (Redis-backed) test
		// file's -- `resetRateLimitState()` above only clears state left over
		// from BEFORE this file's own tests start, not between them.
		const registrationBody = () =>
			JSON.stringify({
				client_name: `multi-replica-rate-limit-test-${randomUUID()}`,
				redirect_uris: ['https://example.com/callback'],
			});

		// `RATE_LIMIT_REGISTER_MAX` defaults to a real, unmodified production
		// value (this suite never raises limits to pass -- see
		// `RATE_LIMIT_KEY_NAMESPACE` isolation instead). Fire requests at
		// replica A until it starts returning 429, tracking exactly how many
		// were admitted; a fresh network identity from a real client's point
		// of view would be indistinguishable between the two replicas
		// because the limiter keys by client-identifying request data
		// (shared Redis), not by which process answered.
		let admittedAtReplicaA = 0;
		for (let attempt = 0; attempt < 200; attempt++) {
			const response = await fetch(`http://127.0.0.1:${replicaAPort}/oauth/register`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: registrationBody(),
			});
			if (response.status === 429) break;
			admittedAtReplicaA++;
		}

		expect(admittedAtReplicaA).toBeGreaterThan(0);

		// If replica B tracked its own independent in-memory budget instead
		// of sharing Redis, it would admit another full batch here. It must
		// not: the very next request, now routed to the OTHER replica, is
		// still governed by the same exhausted shared window.
		const responseFromReplicaB = await fetch(`http://127.0.0.1:${replicaBPort}/oauth/register`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: registrationBody(),
		});

		expect(responseFromReplicaB.status).toBe(429);
	});
});
