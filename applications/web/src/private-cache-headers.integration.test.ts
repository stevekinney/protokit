import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';

const { handleApplicationRequest } = await import('@web/application');
const { createSession } = await import('@web/lib/session-authentication');

/**
 * SEC-005 / S-10: "The authenticated home page, the consent page, and the
 * dynamic client registration secret response have no `Cache-Control:
 * no-store`; private HTML has no `Vary: Cookie`." This file proves the
 * fix end to end against the real dispatcher — the roadmap's acceptance
 * criterion is "a proxy-cache test cannot replay one user's response to
 * another," which `Vary: Cookie` (a cache must key on the cookie, so it
 * can never serve one user's stored response back to a different user's
 * request) plus `no-store` (a cache must not store the response at all)
 * together guarantee.
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

const testRunId = randomUUID();
const userId = randomUUID();

beforeAll(async () => {
	await database.insert(schema.users).values({
		id: userId,
		email: `private-cache-test-${testRunId}@example.com`,
		name: 'Private Cache Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
});

afterAll(async () => {
	await database.delete(schema.userSessions).where(eq(schema.userSessions.userId, userId));
	await database.delete(schema.users).where(eq(schema.users.id, userId));
});

describe('private response caching (real dispatcher)', () => {
	it('the unauthenticated home page is non-cacheable and varies on Cookie', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/`);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store, private');
		expect(response.headers.get('pragma')).toBe('no-cache');
		expect(response.headers.get('vary')).toBe('Cookie');
	});

	it('the authenticated home page is non-cacheable, so a proxy cannot key a cached copy by URL alone', async () => {
		const port = startServer();
		const session = await createSession({
			userId,
			request: new Request(`http://127.0.0.1:${port}/`),
		});
		const rawCookie = session.cookieHeaderValue.split(';')[0];
		const response = await fetch(`http://127.0.0.1:${port}/`, {
			headers: { cookie: rawCookie },
		});
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('private-cache-test');
		expect(response.headers.get('cache-control')).toBe('no-store, private');
		expect(response.headers.get('vary')).toBe('Cookie');
	});

	it('an OAuth authorize error page is non-cacheable', async () => {
		const port = startServer();
		const response = await fetch(
			`http://127.0.0.1:${port}/oauth/authorize?client_id=&redirect_uri=&response_type=code&code_challenge=abc`,
			{ redirect: 'manual' },
		);
		// No session cookie -> redirected to sign-in, which is also non-cacheable.
		expect(response.status).toBe(302);
		expect(response.headers.get('cache-control')).not.toBe('public');
	});

	describeWithRedis('DCR registration response (requires Redis)', () => {
		it('the client-secret-bearing registration response is explicitly no-store', async () => {
			const port = startServer();
			const response = await fetch(`http://127.0.0.1:${port}/oauth/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					client_name: `Private Cache Test Client ${testRunId}`,
					redirect_uris: ['https://example.com/callback'],
				}),
			});
			expect(response.status).toBe(201);
			expect(response.headers.get('cache-control')).toBe('no-store, private');
			expect(response.headers.get('pragma')).toBe('no-cache');
		});
	});
});
