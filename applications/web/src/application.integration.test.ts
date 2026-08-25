import { afterEach, describe, expect, it } from 'bun:test';
import { fetchFromTestServer, startTestServer } from '@web/test-support/start-test-server';
import type { TestServerHandle } from '@web/test-support/start-test-server';

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

// OPEN-3: rate-limit state (register/token/revoke/google-auth/mcp/health)
// is keyed by network identity, which is the loopback address for every
// test in this file, and that state persists in Redis across process
// runs. Flush every `rate_limit:*` key before this file's Redis-backed
// tests run so a prior run's accumulated counts can never flip a test that
// expects success into a stale 429. See `oauth-routes.integration.test.ts`
// for the sibling copy of this reset.
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

describe('application request routing', () => {
	it('renders the home page with Google sign-in call-to-action', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/`);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('Continue With Google');
		expect(body).toContain('/auth/google/start');
	});

	// Google sign-in is now rate-limited (SEC-003), which requires the
	// shared Redis-backed limiter.
	describeWithRedis('with Redis', () => {
		it('redirects to Google OAuth and sets state cookie', async () => {
			const handle = startServer();
			const response = await fetchFromTestServer(
				handle,
				`/auth/google/start?callback_path=%2Foauth%2Fauthorize`,
				{ redirect: 'manual' },
			);

			expect(response.status).toBe(302);
			expect(response.headers.get('location')).toContain('accounts.google.com/o/oauth2/v2/auth');

			// FEDAUTH-001 gives each sign-in attempt its own state cookie,
			// `google_oauth_state_<suffix>`, so concurrent attempts in one browser
			// cannot overwrite each other's state. Assert the per-attempt shape
			// rather than a bare prefix — matching `google_oauth_state_` alone would
			// still pass if the suffix were dropped and the fixed name came back.
			expect(response.headers.get('set-cookie')).toMatch(/google_oauth_state_[0-9a-f]+=/);
		});
	});

	it('returns OAuth authorization metadata with redesigned endpoint paths', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/.well-known/oauth-authorization-server`);
		expect(response.status).toBe(200);
		const payload = (await response.json()) as Record<string, string>;
		expect(payload.authorization_endpoint).toContain('/oauth/authorize');
		expect(payload.token_endpoint).toContain('/oauth/token');
		expect(payload.registration_endpoint).toContain('/oauth/register');
	});

	it('advertises revocation endpoint in authorization metadata', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/.well-known/oauth-authorization-server`);
		expect(response.status).toBe(200);
		const payload = (await response.json()) as Record<string, string>;
		expect(payload.revocation_endpoint).toContain('/oauth/revoke');
	});

	it('responds to OAuth token preflight', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'OPTIONS',
			headers: {
				origin: 'http://localhost:3000',
			},
		});
		expect(response.status).toBe(204);
		expect(response.headers.get('access-control-allow-methods')).toContain('GET');
	});

	it('responds to OAuth revoke preflight', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/oauth/revoke`, {
			method: 'OPTIONS',
			headers: {
				origin: 'http://localhost:3000',
			},
		});
		expect(response.status).toBe(204);
		expect(response.headers.get('access-control-allow-methods')).toContain('POST');
	});
});

describe('security headers', () => {
	it('sets script-src self on the homepage', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/`);
		expect(response.status).toBe(200);
		const csp = response.headers.get('content-security-policy');
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("script-src 'self'");
	});

	// The Google callback is now rate-limited (SEC-003), which requires the
	// shared Redis-backed limiter.
	describeWithRedis('with Redis', () => {
		it('sets script-src self on non-oauth HTML pages', async () => {
			const handle = startServer();
			const response = await fetchFromTestServer(
				handle,
				`/auth/google/callback?error=access_denied`,
			);
			const csp = response.headers.get('content-security-policy');
			expect(csp).toContain("script-src 'self'");
		});
	});

	it('does not set Content-Security-Policy on JSON responses', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/.well-known/oauth-authorization-server`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-security-policy')).toBeNull();
	});

	it('includes X-Request-Id header on every response', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/`);
		const requestId = response.headers.get('x-request-id');
		expect(requestId).not.toBeNull();
		expect(requestId!.length).toBeGreaterThan(0);
	});

	it('sets X-Content-Type-Options nosniff on all responses', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/`);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});
});

describe('client bundle and hydration', () => {
	it('homepage HTML contains script tag and client.js reference', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/`);
		const body = await response.text();
		expect(body).toContain('<script');
		expect(body).toContain('/assets/client.js');
	});

	it('homepage HTML contains application-root hydration target', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/`);
		const body = await response.text();
		expect(body).toContain('id="application-root"');
	});

	it('homepage HTML contains __SERVER_DATA__ script', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/`);
		const body = await response.text();
		expect(body).toContain('__SERVER_DATA__');
	});
});

describe('error handling', () => {
	it('returns JSON 404 for unknown routes', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/nonexistent`);
		expect(response.status).toBe(404);
		const body = (await response.json()) as Record<string, string>;
		expect(body.error).toBe('not_found');
	});
});

describe('MCP endpoint authentication', () => {
	// Every MCP request is now rate-limited by network identity before
	// authentication (SEC-003), which requires the shared Redis-backed
	// limiter.
	describeWithRedis('with Redis', () => {
		it('returns 401 when no authorization header is provided', async () => {
			const handle = startServer();
			const response = await fetchFromTestServer(handle, `/mcp`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'initialize',
					id: 1,
					params: {
						protocolVersion: '2025-11-25',
						capabilities: {},
						clientInfo: { name: 'test', version: '0.1.0' },
					},
				}),
			});
			expect(response.status).toBe(401);
			const body = (await response.json()) as Record<string, string>;
			expect(body.error).toBe('unauthorized');
		});

		it('returns 401 for invalid bearer token', async () => {
			const handle = startServer();
			const response = await fetchFromTestServer(handle, `/mcp`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
					Authorization: 'Bearer invalid-token',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'initialize',
					id: 1,
					params: {
						protocolVersion: '2025-11-25',
						capabilities: {},
						clientInfo: { name: 'test', version: '0.1.0' },
					},
				}),
			});
			expect(response.status).toBe(401);
		});
	});
});

describeWithRedis('OAuth client registration (requires Redis)', () => {
	it('rejects registration with invalid JSON', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/oauth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not json',
		});
		expect(response.status).toBe(400);
	});

	it('rejects registration with missing redirect_uris', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/oauth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ client_name: 'test' }),
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, string>;
		expect(body.error).toBe('invalid_client_metadata');
	});
});

describeWithRedis('OAuth token endpoint (requires Redis)', () => {
	it('rejects unsupported grant type', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'grant_type=password&username=test&password=test',
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, string>;
		expect(body.error).toBe('unsupported_grant_type');
	});

	it('rejects authorization_code grant with missing parameters', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/oauth/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'grant_type=authorization_code',
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, string>;
		expect(body.error).toBe('invalid_request');
	});
});

describeWithRedis('OAuth token revocation (requires Redis)', () => {
	// OAUTH-003 / S-02: `/oauth/revoke` now authenticates the caller as a
	// registered OAuth client before it will touch any token row (see
	// `handleOauthRevokePostInner` in `oauth-routes.ts`). A real, public
	// (`token_endpoint_auth_method: none`) client is registered through the
	// live `/oauth/register` endpoint so this file keeps proving RFC 7009's
	// "200 even for an unknown token" contract against an *authenticated*
	// request -- the only kind `/oauth/revoke` accepts now -- rather than an
	// unauthenticated one the endpoint no longer allows.
	async function registerPublicClient(handle: TestServerHandle): Promise<string> {
		const response = await fetchFromTestServer(handle, `/oauth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				client_name: 'Revocation RFC 7009 Test Client',
				redirect_uris: ['https://example.com/callback'],
				token_endpoint_auth_method: 'none',
			}),
		});
		expect(response.status).toBe(201);
		const body = (await response.json()) as { client_id: string };
		return body.client_id;
	}

	it('returns 200 for revocation of unknown token per RFC 7009', async () => {
		const handle = startServer();
		const clientId = await registerPublicClient(handle);
		const response = await fetchFromTestServer(handle, `/oauth/revoke`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ token: 'nonexistent-token', client_id: clientId }).toString(),
		});
		expect(response.status).toBe(200);
	});

	it('rejects revocation with missing token parameter', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/oauth/revoke`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: '',
		});
		expect(response.status).toBe(400);
	});

	it('rejects revocation with no client_id (OAUTH-003 / S-02: revocation is now client-bound)', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/oauth/revoke`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ token: 'nonexistent-token' }).toString(),
		});
		expect(response.status).toBe(400);
	});

	it('rejects revocation from an unregistered client', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/oauth/revoke`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				token: 'nonexistent-token',
				client_id: 'never-registered-client',
			}).toString(),
		});
		expect(response.status).toBe(401);
	});
});
