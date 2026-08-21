import { afterEach, describe, expect, it } from 'bun:test';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';

const { handleApplicationRequest } = await import('@web/application');

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

// OPEN-3: this file's Redis-backed tests key rate-limit state by network
// identity (loopback, in this suite), and that state persists in Redis
// across process runs. Without a reset, a rejection test that asserts a
// specific 400 can instead observe a stale 429 left over from an earlier
// run against the same Redis instance. Flush every `rate_limit:*` key
// before this file's Redis-backed tests run, rather than enumerating the
// specific buckets this file happens to exercise today, so a future bucket
// added to `request-rate-limiter.ts` doesn't reintroduce the same
// order-dependence silently.
if (redisAvailable) {
	const { getRedisClient } = await import('@web/lib/redis-client');
	const redisClient = await getRedisClient();
	const staleRateLimitKeys = await redisClient.keys('rate_limit:*');
	if (staleRateLimitKeys.length > 0) {
		await redisClient.del(staleRateLimitKeys);
	}
}

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

let server: Bun.Server | null = null;

afterEach(() => {
	server?.stop(true);
	server = null;
});

function startServer(): number {
	server = Bun.serve({
		port: 0,
		fetch(request, bunServer) {
			return handleApplicationRequest(request, {
				clientAddress: bunServer.requestIP(request)?.address,
			});
		},
	});

	return server.port;
}

describe('authorization server metadata (client_credentials removal)', () => {
	it('never advertises client_credentials as a supported grant type', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`);
		expect(response.status).toBe(200);
		const body = (await response.json()) as Record<string, unknown>;
		expect(body.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
		expect(body.extensions).not.toHaveProperty('io.modelcontextprotocol/oauth-client-credentials');
	});
});

describeWithRedis('client_credentials rejection end-to-end (requires Redis)', () => {
	it('rejects dynamic client registration that requests client_credentials', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/oauth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				client_name: 'Attempted Machine Client',
				redirect_uris: ['https://example.com/callback'],
				grant_types: ['client_credentials'],
			}),
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, string>;
		expect(body.error).toBe('invalid_client_metadata');
		expect(body.client_id).toBeUndefined();
		expect(body.client_secret).toBeUndefined();
	});

	it('rejects a client_credentials token request outright', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/oauth/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'client_credentials',
				client_id: 'any-client-id',
				client_secret: 'any-client-secret',
			}).toString(),
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, string>;
		expect(body.error).toBe('unsupported_grant_type');
		expect(body.access_token).toBeUndefined();
	});
});

// Dynamic-registration success and the full authorization_code + PKCE token exchange are
// covered against a mocked database in oauth-routes.test.tsx — that suite proves the
// interactive connector flow (authorize -> approve -> code exchange -> refresh) is untouched
// by this removal. This boot-level check only proves the route is still wired end to end
// without requiring a live Postgres instance.
describe('interactive authorization_code connector flow stays intact', () => {
	// /oauth/authorize is now rate-limited (SEC-003), which requires the
	// shared Redis-backed limiter.
	describeWithRedis('with Redis', () => {
		it('still requires user authentication before issuing an authorization code', async () => {
			const port = startServer();
			const response = await fetch(
				`http://127.0.0.1:${port}/oauth/authorize?client_id=unknown&redirect_uri=https://example.com/cb&response_type=code&code_challenge=abc`,
				{ redirect: 'manual' },
			);
			expect(response.status).toBe(302);
			expect(response.headers.get('location')).toContain('/auth/google/start');
		});
	});
});
