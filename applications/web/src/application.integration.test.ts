import { afterEach, describe, expect, it } from 'bun:test';

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.BETTER_AUTH_SECRET =
	process.env.BETTER_AUTH_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';

const { handleApplicationRequest } = await import('@web/application');

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
});
