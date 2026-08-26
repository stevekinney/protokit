import { describe, expect, it, mock, beforeEach } from 'bun:test';

const mockEnvironment: Record<string, unknown> = {};
let mockDatabaseHealthy = true;
let mockRedisHealthy = true;
let mockDatabaseCallCount = 0;
// Round-3 review (OPS-002): a dependency that accepts the probe but never answers must not hang
// `probeDependencies` -- and therefore the coalesced-probe cache's `inFlight` slot -- forever.
let mockDatabaseHang = false;
let mockRedisConfigured = true;
let mockRateLimitAllowed = true;
let mockRateLimitRetryAfterSeconds = 0;

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@template/database', () => ({
	database: {
		execute: async () => {
			mockDatabaseCallCount += 1;
			if (mockDatabaseHang) return new Promise(() => {}); // never resolves or rejects
			if (!mockDatabaseHealthy) throw new Error('database down');
			return [{ '?column?': 1 }];
		},
	},
}));

mock.module('drizzle-orm', () => ({
	sql: Object.assign((strings: TemplateStringsArray) => strings.join(''), {
		raw: (value: string) => value,
	}),
}));

mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => mockRedisConfigured,
	isRedisHealthy: async () => mockRedisHealthy,
}));

mock.module('@web/lib/instance-identifier', () => ({
	instanceIdentifier: 'test-instance-id',
}));

mock.module('@web/lib/mcp-protocol-constants', () => ({
	mcpSupportedProtocolVersions: ['2025-11-25', '2026-07-28'],
}));

mock.module('@web/lib/request-rate-limiter', () => ({
	enforceHealthProbeRateLimit: async () => ({
		allowed: mockRateLimitAllowed,
		retryAfterSeconds: mockRateLimitRetryAfterSeconds,
		remainingRequests: mockRateLimitAllowed ? 10 : 0,
	}),
}));

const { handleHealthGet, handleHealthReadinessGet, resetHealthReadinessCacheForTests } =
	await import('@web/routes/health-routes');

function buildContext(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		request: new Request('https://app.example.com/health/ready', {
			headers: { authorization: 'Bearer readiness-key' },
		}),
		requestUrl: new URL('https://app.example.com/health/ready'),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: null,
		sessionToken: null,
		...overrides,
	};
}

function setEnvironment(overrides: Record<string, unknown>) {
	for (const key of Object.keys(mockEnvironment)) {
		delete mockEnvironment[key];
	}
	Object.assign(mockEnvironment, {
		mcpEnableUiExtension: true,
		nodeEnv: 'test',
		healthReadinessApiKey: 'readiness-key',
		healthReadinessCacheTtlSeconds: 2,
		...overrides,
	});
}

describe('handleHealthGet', () => {
	beforeEach(() => {
		mockDatabaseHealthy = true;
		mockRedisHealthy = true;
		setEnvironment({});
	});

	it('returns 200 with only a status field, no dependency or topology detail', async () => {
		const response = handleHealthGet();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ status: 'ok' });
	});

	it('reports ok even when the database and Redis are both down', async () => {
		mockDatabaseHealthy = false;
		mockRedisHealthy = false;
		const response = handleHealthGet();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ status: 'ok' });
	});
});

describe('handleHealthReadinessGet', () => {
	beforeEach(() => {
		mockDatabaseHealthy = true;
		mockRedisHealthy = true;
		mockDatabaseHang = false;
		mockRedisConfigured = true;
		mockRateLimitAllowed = true;
		mockRateLimitRetryAfterSeconds = 0;
		setEnvironment({});
		resetHealthReadinessCacheForTests();
	});

	it('returns 404 when no readiness key is configured', async () => {
		setEnvironment({ healthReadinessApiKey: undefined });
		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(404);
	});

	// Review finding (P2): a disabled endpoint (healthReadinessApiKey
	// unset) must return its promised 404 even when Redis -- which the rate
	// limiter depends on -- is unavailable. Before the fix, the rate-limit
	// check ran BEFORE the not-configured check, so this scenario threw
	// instead of returning 404, turning a disabled endpoint into a 500 that
	// depends on infrastructure it has no other reason to need. See the
	// identical regression test in `metrics-routes.test.ts`.
	it('returns 404 when no readiness key is configured, even if the rate limiter would throw (Redis unavailable)', async () => {
		setEnvironment({ healthReadinessApiKey: undefined });
		mock.module('@web/lib/request-rate-limiter', () => ({
			enforceHealthProbeRateLimit: async () => {
				throw new Error('simulated Redis unavailable');
			},
		}));

		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(404);

		mock.module('@web/lib/request-rate-limiter', () => ({
			enforceHealthProbeRateLimit: async () => ({
				allowed: mockRateLimitAllowed,
				retryAfterSeconds: mockRateLimitRetryAfterSeconds,
				remainingRequests: mockRateLimitAllowed ? 10 : 0,
			}),
		}));
	});

	it('returns 401 when no authorization header is presented', async () => {
		const response = await handleHealthReadinessGet(
			buildContext({ request: new Request('https://app.example.com/health/ready') }),
		);
		expect(response.status).toBe(401);
	});

	it('returns 401 when the bearer token does not match', async () => {
		const response = await handleHealthReadinessGet(
			buildContext({
				request: new Request('https://app.example.com/health/ready', {
					headers: { authorization: 'Bearer wrong-key' },
				}),
			}),
		);
		expect(response.status).toBe(401);
	});

	it('returns 200 with full dependency detail when authorized and healthy', async () => {
		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe('ok');
		expect(body.instanceIdentifier).toBe('test-instance-id');
		expect(body.dependencies.redis).toBe('ok');
		expect(body.dependencies.database).toBe('ok');
	});

	it('returns 503 with degraded status when the database is down', async () => {
		mockDatabaseHealthy = false;
		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.dependencies.database).toBe('unavailable');
	});

	it('returns 503 with degraded status when Redis is down', async () => {
		mockRedisHealthy = false;
		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.dependencies.redis).toBe('unavailable');
	});

	it('sets Cache-Control: no-store on every response shape', async () => {
		const authorized = await handleHealthReadinessGet(buildContext());
		expect(authorized.headers.get('Cache-Control')).toBe('no-store');

		setEnvironment({ healthReadinessApiKey: undefined });
		const notConfigured = await handleHealthReadinessGet(buildContext());
		expect(notConfigured.headers.get('Cache-Control')).toBe('no-store');
	});

	it('reports extensions.ui as false when the flag is on but no MCP App resource is registered (review round 4)', async () => {
		// This repository ships no `packages/mcp-apps` application today, so
		// `hasRegisteredUiExtensionResource()` is always false in this real
		// build -- matching what `/mcp` and OAuth metadata actually advertise.
		setEnvironment({ mcpEnableUiExtension: true });
		const response = await handleHealthReadinessGet(buildContext());
		const body = await response.json();
		expect(body.extensions.ui).toBe(false);
	});

	it('reports extensions.ui as false when the flag itself is off, regardless of any registered resource', async () => {
		setEnvironment({ mcpEnableUiExtension: false });
		const response = await handleHealthReadinessGet(buildContext());
		const body = await response.json();
		expect(body.extensions.ui).toBe(false);
	});

	it('never advertises the enterprise-managed authorization extension', async () => {
		const response = await handleHealthReadinessGet(buildContext());
		const body = await response.json();
		expect(body.extensions).not.toHaveProperty('enterpriseManagedAuthorization');
		expect(body.dependencies).not.toHaveProperty('enterprisePolicyBackend');
	});

	it('coalesces and caches the dependency probe across requests within the TTL window', async () => {
		mockDatabaseCallCount = 0;

		await Promise.all([
			handleHealthReadinessGet(buildContext()),
			handleHealthReadinessGet(buildContext()),
			handleHealthReadinessGet(buildContext()),
		]);
		await handleHealthReadinessGet(buildContext());

		expect(mockDatabaseCallCount).toBe(1);
	});

	it('clears the coalesced in-flight probe after a dependency accepts but never answers, instead of hanging every caller forever', async () => {
		// Regression for a round-3 review finding (P2): `probeDependencies` had no deadline of
		// its own, so a dependency that accepts a connection but never completes its probe
		// (Neon leaves `select 1` pending, Redis stalls after connecting) left
		// `createCoalescedProbe`'s `inFlight` promise permanently unsettled -- every
		// subsequent `/health/ready` request, forever, would await that same probe. Reverting
		// the `withDeadline` wrap around `database.execute` in `isDatabaseHealthy`
		// reproduces this directly: the test times out instead of observing 503.
		mockDatabaseHang = true;

		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.dependencies.database).toBe('unavailable');

		// The stuck probe's own deadline resolved, which cleared `inFlight` -- prove the
		// coalescer is genuinely usable again, not merely that one call returned. Recovery
		// (the dependency now healthy) is observable on the very next request once the TTL
		// window from the degraded result has passed.
		mockDatabaseHang = false;
		resetHealthReadinessCacheForTests();
		const recovered = await handleHealthReadinessGet(buildContext());
		expect(recovered.status).toBe(200);
		const recoveredBody = await recovered.json();
		expect(recoveredBody.dependencies.database).toBe('ok');
	}, 10_000);

	it('does not start a second real database probe while the first is still outstanding, even once the cached snapshot expires (round-14 review)', async () => {
		// Regression for a round-14 review finding (P2): `withDeadline` bounds how long a
		// CALLER waits for `database.execute`, but it cannot cancel that promise -- the
		// installed neon-http driver has no per-call cancellation hook through the shared
		// drizzle client (see the doc comment on `isDatabaseHealthy`). Before this fix, once
		// the coalesced-probe cache's cached (degraded) snapshot expired, the NEXT readiness
		// poll launched a brand-new `database.execute()` on top of the still-pending one from
		// the previous poll -- repeated forever during a prolonged outage, each abandoned
		// probe never cleaned up. Setting the cache TTL to 0 forces the very next call past
		// the cached-result branch, straight back into `probeDependencies()`, without waiting
		// for a real TTL window -- proving the bound holds across cache expiry, not just
		// within one coalescing window.
		setEnvironment({ healthReadinessCacheTtlSeconds: 0 });
		resetHealthReadinessCacheForTests();
		mockDatabaseCallCount = 0;
		mockDatabaseHang = true;

		const first = await handleHealthReadinessGet(buildContext());
		expect(first.status).toBe(503);
		expect(mockDatabaseCallCount).toBe(1);

		const second = await handleHealthReadinessGet(buildContext());
		expect(second.status).toBe(503);
		// The fix under test: still exactly one real database call, not two -- the second
		// poll reused the same still-outstanding probe instead of starting its own.
		expect(mockDatabaseCallCount).toBe(1);

		mockDatabaseHang = false;
		resetHealthReadinessCacheForTests();
	}, 15_000);

	it('reports redis as not_configured when Redis is not configured at all', async () => {
		mockRedisConfigured = false;
		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.dependencies.redis).toBe('not_configured');
		expect(body.status).toBe('ok');
	});

	it('returns 429 with Retry-After when the readiness rate limit is exceeded', async () => {
		mockRateLimitAllowed = false;
		mockRateLimitRetryAfterSeconds = 42;
		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('42');
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		const body = await response.json();
		expect(body.error).toBe('rate_limited');
	});

	it('rejects a request over plaintext transport in production', async () => {
		setEnvironment({ nodeEnv: 'production' });
		const response = await handleHealthReadinessGet(
			buildContext({
				request: new Request('http://app.example.com/health/ready', {
					headers: { authorization: 'Bearer readiness-key' },
				}),
			}),
		);
		expect(response.status).toBe(400);
	});
});
