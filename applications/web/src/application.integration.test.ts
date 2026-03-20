import { afterEach, describe, expect, it } from 'bun:test';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';

const { handleApplicationRequest } = await import('@web/application');

let redisAvailable = false;
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

describe('application request routing', () => {
	it('renders the home page with Google sign-in call-to-action', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/`);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('Continue With Google');
		expect(body).toContain('/auth/google/start');
	});

	it('redirects to Google OAuth and sets state cookie', async () => {
		const port = startServer();
		const response = await fetch(
			`http://127.0.0.1:${port}/auth/google/start?callback_path=%2Foauth%2Fauthorize`,
			{ redirect: 'manual' },
		);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toContain('accounts.google.com/o/oauth2/v2/auth');
		expect(response.headers.get('set-cookie')).toContain('google_oauth_state=');
	});

	it('returns OAuth authorization metadata with redesigned endpoint paths', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`);
		expect(response.status).toBe(200);
		const payload = (await response.json()) as Record<string, string>;
		expect(payload.authorization_endpoint).toContain('/oauth/authorize');
		expect(payload.token_endpoint).toContain('/oauth/token');
		expect(payload.registration_endpoint).toContain('/oauth/register');
	});

	it('advertises revocation endpoint in authorization metadata', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`);
		expect(response.status).toBe(200);
		const payload = (await response.json()) as Record<string, string>;
		expect(payload.revocation_endpoint).toContain('/oauth/revoke');
	});

	it('responds to OAuth token preflight', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/oauth/token`, {
			method: 'OPTIONS',
			headers: {
				origin: 'http://localhost:3000',
			},
		});
		expect(response.status).toBe(204);
		expect(response.headers.get('access-control-allow-methods')).toContain('GET');
	});

	it('responds to OAuth revoke preflight', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/oauth/revoke`, {
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
	it('sets Content-Security-Policy on HTML responses', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/`);
		expect(response.status).toBe(200);
		const csp = response.headers.get('content-security-policy');
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("script-src 'none'");
	});

	it('does not set Content-Security-Policy on JSON responses', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-security-policy')).toBeNull();
	});

	it('includes X-Request-Id header on every response', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/`);
		const requestId = response.headers.get('x-request-id');
		expect(requestId).not.toBeNull();
		expect(requestId!.length).toBeGreaterThan(0);
	});

	it('sets X-Content-Type-Options nosniff on all responses', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/`);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});
});

describe('error handling', () => {
	it('returns JSON 404 for unknown routes', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/nonexistent`);
		expect(response.status).toBe(404);
		const body = (await response.json()) as Record<string, string>;
		expect(body.error).toBe('not_found');
	});
});

describe('MCP endpoint authentication', () => {
	it('returns 401 when no authorization header is provided', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
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

	describeWithRedis('with Redis', () => {
		it('returns 401 for invalid bearer token', async () => {
			const port = startServer();
			const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
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
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/oauth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not json',
		});
		expect(response.status).toBe(400);
	});

	it('rejects registration with missing redirect_uris', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/oauth/register`, {
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
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/oauth/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'grant_type=password&username=test&password=test',
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, string>;
		expect(body.error).toBe('unsupported_grant_type');
	});

	it('rejects authorization_code grant with missing parameters', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/oauth/token`, {
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
	it('returns 200 for revocation of unknown token per RFC 7009', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/oauth/revoke`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'token=nonexistent-token',
		});
		expect(response.status).toBe(200);
	});

	it('rejects revocation with missing token parameter', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/oauth/revoke`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: '',
		});
		expect(response.status).toBe(400);
	});
});
