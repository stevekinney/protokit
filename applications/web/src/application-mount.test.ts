import { beforeEach, describe, expect, it, mock } from 'bun:test';

/**
 * Proves the host-embeddable mount seam actually does what it
 * says -- dynamic routes still dispatch, but the two static-asset prefixes
 * `handleApplicationRequest` would otherwise serve on its own
 * (`/favicon.png`, `/assets/*`) fall through to the ordinary 404 instead,
 * so a host that embeds this application never gets two different
 * answers for the same static path.
 *
 * It also proves the mount is a real lifecycle rather than a bare handler
 * factory: an embedded deployment that skipped the production invariant
 * check, the asset-manifest load, or the scheduled-cleanup start would boot
 * in a configuration the standalone `server.ts` refuses, serve unstyled and
 * unhydratable HTML, and leak expired credential rows -- each silently. The
 * startup and teardown assertions below exist so a future refactor cannot
 * quietly drop one of those steps again.
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

// Mutable so the disposal tests can drive both Redis branches. The mock
// factory closes over these, so flipping them between tests is enough --
// re-registering the module mock would not affect the already-imported
// `application-mount` module graph.
let redisConfigured = false;
let redisQuitError: Error | null = null;
const redisQuitCalls: string[] = [];

mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => redisConfigured,
	isRedisHealthy: async () => false,
	getRedisClient: async () => {
		if (!redisConfigured) throw new Error('Redis is not configured in this test.');
		return {
			quit: async () => {
				redisQuitCalls.push('quit');
				if (redisQuitError) throw redisQuitError;
			},
		};
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

const lifecycleCalls: string[] = [];
let assertInvariantsError: Error | null = null;

mock.module('@web/lib/startup-invariants', () => ({
	assertProductionStartupInvariants: () => {
		lifecycleCalls.push('assertProductionStartupInvariants');
		if (assertInvariantsError) throw assertInvariantsError;
	},
}));

mock.module('@web/lib/asset-manifest', () => ({
	loadAssetManifest: async () => {
		lifecycleCalls.push('loadAssetManifest');
		return {
			stylesheetPath: '/assets/application-abc123.css',
			clientBundlePath: '/assets/client-abc123.js',
			clientSourceMapPath: '/assets/client-abc123.js.map',
		};
	},
	getAssetManifest: () => ({
		stylesheetPath: '/assets/application-abc123.css',
		clientBundlePath: '/assets/client-abc123.js',
		clientSourceMapPath: '/assets/client-abc123.js.map',
	}),
}));

mock.module('@web/lib/scheduled-cleanup', () => ({
	startScheduledCleanup: (intervalMs: number) => {
		lifecycleCalls.push(`startScheduledCleanup:${intervalMs}`);
	},
	stopScheduledCleanup: () => {
		lifecycleCalls.push('stopScheduledCleanup');
	},
	isScheduledCleanupRunning: () => false,
}));

mock.module('@web/lib/mcp-handler', () => ({
	shutdownMcpTransports: async () => {
		lifecycleCalls.push('shutdownMcpTransports');
	},
	handleMcpRequest: async () => new Response(null, { status: 500 }),
	publishUserResourceUpdate: () => {},
	shouldEnableConformanceMode: () => false,
}));

const { createApplicationMount } = await import('@web/application-mount');
const { handleApplicationRequest } = await import('@web/application');

describe('createApplicationMount', () => {
	beforeEach(() => {
		lifecycleCalls.length = 0;
		capturedSocketAddresses.length = 0;
		assertInvariantsError = null;
		redisConfigured = false;
		redisQuitError = null;
		redisQuitCalls.length = 0;
	});

	describe('startup lifecycle', () => {
		it('runs the production invariant check, loads the asset manifest, and starts cleanup', async () => {
			mockEnvironment.SCHEDULED_CLEANUP_INTERVAL_SECONDS = 3600;
			const mount = await createApplicationMount();

			expect(lifecycleCalls).toEqual([
				'assertProductionStartupInvariants',
				'loadAssetManifest',
				'startScheduledCleanup:3600000',
			]);

			await mount.dispose();
		});

		it('refuses to mount when the production invariants fail, before starting anything', async () => {
			// Fail-fast ordering matters: a mount that started the cleanup
			// interval and then threw would leave a live timer behind in a
			// process that is about to be considered un-started.
			assertInvariantsError = new Error('Production startup invariants failed');

			await expect(createApplicationMount()).rejects.toThrow(
				'Production startup invariants failed',
			);
			expect(lifecycleCalls).toEqual(['assertProductionStartupInvariants']);
		});
	});

	describe('request dispatch', () => {
		it('dispatches a delegated route (GET /health) and still runs logging/header logic', async () => {
			const mount = await createApplicationMount();
			const response = await mount.handleRequest(new Request('https://app.example.com/health'));
			expect(response.status).toBe(200);
			expect(Boolean(response.headers.get('X-Request-Id'))).toBe(true);
			await mount.dispose();
		});

		it('skips the favicon that plain handleApplicationRequest would serve', async () => {
			const mount = await createApplicationMount();
			const mountResponse = await mount.handleRequest(
				new Request('https://app.example.com/favicon.png'),
			);
			expect(mountResponse.status).toBe(404);
			expect(await mountResponse.json()).toEqual({ error: 'not_found' });

			const unmodifiedResponse = await handleApplicationRequest(
				new Request('https://app.example.com/favicon.png'),
			);
			expect(unmodifiedResponse.status).toBe(200);
			expect(unmodifiedResponse.headers.get('content-type')).toContain('image');

			await mount.dispose();
		});

		it('skips /assets/* paths the same way it skips the favicon', async () => {
			const mount = await createApplicationMount();
			const response = await mount.handleRequest(
				new Request('https://app.example.com/assets/does-not-exist.js'),
			);
			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({ error: 'not_found' });
			await mount.dispose();
		});

		it('propagates clientAddress into network-identity resolution', async () => {
			const mount = await createApplicationMount();
			await mount.handleRequest(new Request('https://app.example.com/health'), {
				clientAddress: '203.0.113.5',
			});
			expect(capturedSocketAddresses).toContain('203.0.113.5');
			await mount.dispose();
		});

		it('omitting the input argument entirely resolves an undefined socket address', async () => {
			const mount = await createApplicationMount();
			await mount.handleRequest(new Request('https://app.example.com/health'));
			expect(capturedSocketAddresses).toContain(undefined);
			await mount.dispose();
		});
	});

	describe('teardown lifecycle', () => {
		it('stops cleanup and closes MCP transports on dispose', async () => {
			const mount = await createApplicationMount();
			lifecycleCalls.length = 0;

			await mount.dispose();

			expect(lifecycleCalls).toEqual(['stopScheduledCleanup', 'shutdownMcpTransports']);
		});

		it('closes the Redis client when Redis is configured', async () => {
			redisConfigured = true;
			const mount = await createApplicationMount();

			await mount.dispose();

			expect(redisQuitCalls).toEqual(['quit']);
		});

		it('a failing Redis quit does not prevent the rest of teardown or throw', async () => {
			// Mirrors `server.ts`: Redis may already be disconnected during a
			// restart, and that must not turn an orderly teardown into a thrown
			// error the host has to handle.
			redisConfigured = true;
			redisQuitError = new Error('Connection already closed');
			const mount = await createApplicationMount();
			lifecycleCalls.length = 0;

			await mount.dispose();

			expect(redisQuitCalls).toEqual(['quit']);
			expect(lifecycleCalls).toEqual(['stopScheduledCleanup', 'shutdownMcpTransports']);
		});

		it('is idempotent: a second dispose does no further teardown work', async () => {
			const mount = await createApplicationMount();
			await mount.dispose();
			lifecycleCalls.length = 0;

			await mount.dispose();

			expect(lifecycleCalls).toEqual([]);
		});
	});
});
