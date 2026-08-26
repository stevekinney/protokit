import { describe, expect, it, mock } from 'bun:test';

/**
 * `request-rate-limiter.test.ts` deliberately configures no `REDIS_URL` so
 * `resolveAtomicStore` exercises the real, atomic in-memory store. That
 * leaves the Redis-backed branch (`getRedisClient()` +
 * `createRedisSlidingWindowStore`) untested, since Bun's `mock.module` for
 * `@web/env` there is fixed for the whole file. This file mocks `@web/env`
 * with a real, reachable `REDIS_URL` (Docker Compose's local test Redis)
 * instead, so `isRedisConfigured()` is genuinely true and the limiter
 * really goes through Redis -- an in-memory stand-in would prove nothing
 * about the atomic Redis store this branch wires up.
 */
const realRedisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

mock.module('@web/env', () => ({
	environment: {
		nodeEnv: 'test',
		redisUrl: realRedisUrl,
		rateLimitRegisterMax: 3,
		rateLimitRegisterWindowSeconds: 60,
		rateLimitKeyNamespace: `redis-backed-rate-limiter-test-${process.pid}`,
	},
}));

const { enforceOauthRegistrationRateLimit } = await import('@web/lib/request-rate-limiter');

describe('request rate limiting with REDIS_URL configured', () => {
	it('allows a request under the limit using the real Redis-backed atomic store', async () => {
		const result = await enforceOauthRegistrationRateLimit({
			networkIdentity: `redis-backed-${process.pid}`,
		});
		expect(result.allowed).toBe(true);
	});

	it('denies requests once the limit is exhausted', async () => {
		const identity = `redis-backed-exhaust-${process.pid}`;
		for (let i = 0; i < 3; i++) {
			await enforceOauthRegistrationRateLimit({ networkIdentity: identity });
		}
		const result = await enforceOauthRegistrationRateLimit({ networkIdentity: identity });
		expect(result.allowed).toBe(false);
	});
});
