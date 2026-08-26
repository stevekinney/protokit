import { describe, expect, it, mock } from 'bun:test';

/**
 * Proves the host-embeddable mount seam actually does what it
 * says -- dynamic routes still dispatch, but the two static-asset prefixes
 * `handleApplicationRequest` would otherwise serve on its own
 * (`/favicon.png`, `/assets/*`) fall through to the ordinary 404 instead,
 * so a host that embeds this application never gets two different
 * answers for the same static path.
 *
 * Follows `lib/pre-session-routing.test.ts`'s mocking style: every module
 * `application.ts` transitively touches during a session-free dispatch is
 * replaced with a minimal stub *before* `@web/application` (and here,
 * `@web/application-mount`) is imported, since Bun's `mock.module` patches
 * the shared module registry and only affects imports that happen after
 * the mock is registered.
 */

const mockEnvironment: Record<string, unknown> = {
	NODE_ENV: 'test',
	MCP_ALLOWED_ORIGINS: 'http://localhost:3000',
	BASE_URL: 'https://app.example.com',
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

mock.module('@web/lib/session-authentication', () => ({
	hydrateSession: async () => ({ user: null, sessionToken: null }),
	createSession: async () => {
		throw new Error('not needed by this test');
	},
	revokeSession: async () => {},
	createExpiredSessionCookie: () => '',
}));

// Captures the `socketAddress` every call to the real client-identifier
// resolver receives, so `clientAddress` propagation can be asserted without
// needing to drive the rate limiter into a distinguishable state.
const capturedSocketAddresses: (string | undefined)[] = [];
mock.module('@web/lib/request-client-identifier', () => ({
	getRequestClientIdentifier: (input: { socketAddress?: string }) => {
		capturedSocketAddresses.push(input.socketAddress);
		return input.socketAddress ?? 'unknown-client';
	},
	getTrustedProxyConfiguration: () => ({
		trustedProxyCidrs: [],
		trustedProxyHeader: undefined,
		trustedProxyHopCount: 0,
	}),
}));

const { createApplicationMountHandler } = await import('@web/application-mount');
const { handleApplicationRequest } = await import('@web/application');

describe('createApplicationMountHandler', () => {
	it('returns a function', () => {
		const mountHandler = createApplicationMountHandler();
		expect(typeof mountHandler).toBe('function');
	});

	it('dispatches a delegated route (GET /health) and still runs logging/header logic', async () => {
		const mountHandler = createApplicationMountHandler();
		const response = await mountHandler(new Request('https://app.example.com/health'), {});
		expect(response.status).toBe(200);
		expect(Boolean(response.headers.get('X-Request-Id'))).toBe(true);
	});

	it('skips the favicon that plain handleApplicationRequest would serve', async () => {
		const mountHandler = createApplicationMountHandler();
		const mountResponse = await mountHandler(
			new Request('https://app.example.com/favicon.png'),
			{},
		);
		expect(mountResponse.status).toBe(404);
		expect(await mountResponse.json()).toEqual({ error: 'not_found' });

		const unmodifiedResponse = await handleApplicationRequest(
			new Request('https://app.example.com/favicon.png'),
		);
		expect(unmodifiedResponse.status).toBe(200);
		expect(unmodifiedResponse.headers.get('content-type')).toContain('image');
	});

	it('skips /assets/* paths the same way it skips the favicon', async () => {
		const mountHandler = createApplicationMountHandler();
		const response = await mountHandler(
			new Request('https://app.example.com/assets/does-not-exist.js'),
			{},
		);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'not_found' });
	});

	it('propagates clientAddress into network-identity resolution the same way handleApplicationRequest does', async () => {
		capturedSocketAddresses.length = 0;
		const mountHandler = createApplicationMountHandler();
		await mountHandler(new Request('https://app.example.com/health'), {
			clientAddress: '203.0.113.5',
		});
		expect(capturedSocketAddresses).toContain('203.0.113.5');
	});
});
