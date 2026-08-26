import { describe, expect, it, mock, beforeEach } from 'bun:test';

/**
 * OPS-002 / S-15, acceptance criterion 4: "Requests that do not need a
 * browser session never query session storage, even when sent with a
 * bogus cookie." This is the direct proof — `hydrateSession` (the one
 * function that reads the session store) is replaced with a call-counting
 * stub, and every session-free route is driven through the REAL
 * `handleApplicationRequest` dispatcher (not a narrower unit) with a
 * cookie header present, so a regression that re-adds session hydration to
 * one of these routes fails this test immediately.
 */

const mockEnvironment: Record<string, unknown> = {
	nodeEnv: 'test',
	mcpAllowedOrigins: 'http://localhost:3000',
	baseUrl: 'https://app.example.com',
};

mock.module('@web/env', () => ({ environment: mockEnvironment }));

mock.module('@template/database', () => ({
	database: { execute: async () => [{ '?column?': 1 }] },
	schema: {},
}));

mock.module('drizzle-orm', () => ({
	sql: Object.assign((strings: TemplateStringsArray) => strings.join(''), {
		raw: (value: string) => value,
	}),
	and: (...arguments_: unknown[]) => arguments_,
	eq: (column: unknown, value: unknown) => ({ column, value }),
	gt: (column: unknown, value: unknown) => ({ column, value }),
	isNull: (column: unknown) => ({ column }),
	inArray: (column: unknown, values: unknown) => ({ column, values }),
}));

mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => false,
	isRedisHealthy: async () => false,
	getRedisClient: async () => {
		throw new Error('Redis is not configured in this test.');
	},
	getRedisSubscriberClient: async () => {
		throw new Error('Redis is not configured in this test.');
	},
	disconnectRedisSubscriberClient: async () => {},
}));

mock.module('@web/lib/instance-identifier', () => ({ instanceIdentifier: 'test-instance-id' }));
mock.module('@web/lib/base-url', () => ({ getBaseUrl: () => 'https://app.example.com' }));

// Deliberately NOT mocking `@web/lib/request-rate-limiter`: with
// `isRedisConfigured` mocked to false and `NODE_ENV` set to `test` (not
// `production`), it falls back to its own real in-memory limiter, which is
// enough to exercise the real code path without needing Redis.

let hydrateSessionCallCount = 0;
mock.module('@web/lib/session-authentication', () => ({
	hydrateSession: async () => {
		hydrateSessionCallCount += 1;
		return { user: null, sessionToken: null };
	},
	createSession: async () => {
		throw new Error('not needed by this test');
	},
	revokeSession: async () => {},
	createExpiredSessionCookie: () => '',
}));

const { handleApplicationRequest } = await import('@web/application');

const bogusCookieHeaders = { Cookie: 'application_session=totally-forged-value' };

describe('pre-session routing (never touches session storage)', () => {
	beforeEach(() => {
		hydrateSessionCallCount = 0;
	});

	const sessionFreePathnames = [
		'/health',
		'/metrics',
		'/.well-known/oauth-authorization-server',
		'/.well-known/oauth-protected-resource',
		'/.well-known/oauth-protected-resource/mcp',
	];

	for (const pathname of sessionFreePathnames) {
		it(`never calls hydrateSession for GET ${pathname} even with a forged cookie`, async () => {
			const request = new Request(`https://app.example.com${pathname}`, {
				headers: bogusCookieHeaders,
			});
			await handleApplicationRequest(request);
			expect(hydrateSessionCallCount).toBe(0);
		});
	}

	it('/health/ready never calls hydrateSession even when unauthenticated with a forged cookie', async () => {
		const request = new Request('https://app.example.com/health/ready', {
			headers: bogusCookieHeaders,
		});
		const response = await handleApplicationRequest(request);
		expect(hydrateSessionCallCount).toBe(0);
		// Unconfigured in this test's environment -> 404, proving the auth
		// check itself ran without needing a session either.
		expect(response.status).toBe(404);
	});

	it('does call hydrateSession for a route that actually needs a session (the homepage)', async () => {
		const request = new Request('https://app.example.com/', {
			headers: bogusCookieHeaders,
		});
		await handleApplicationRequest(request);
		expect(hydrateSessionCallCount).toBe(1);
	});

	it('every session-free route response still carries a stable X-Request-Id', async () => {
		for (const pathname of ['/health', '/metrics', '/.well-known/oauth-authorization-server']) {
			const response = await handleApplicationRequest(
				new Request(`https://app.example.com${pathname}`),
			);
			expect(Boolean(response.headers.get('X-Request-Id'))).toBe(true);
		}
	});
});
