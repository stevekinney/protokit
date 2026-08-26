import { describe, expect, it, mock } from 'bun:test';

/**
 * `request-rate-limiter.ts`'s belt-and-suspenders production guard: even
 * though `assertProductionStartupInvariants` should already refuse to boot
 * without `REDIS_URL` in production, `resolveAtomicStore` refuses the
 * in-memory fallback a second time if Redis somehow becomes unconfigured
 * mid-run. `request-rate-limiter.test.ts` mocks `NODE_ENV: 'test'` with no
 * `REDIS_URL`, which can never reach this branch, so it lives in its own
 * file (own process under `--isolate`) with `NODE_ENV: 'production'`
 * instead.
 */
mock.module('@web/env', () => ({
	environment: {
		nodeEnv: 'production',
		rateLimitRegisterMax: 3,
		rateLimitRegisterWindowSeconds: 60,
	},
}));

const { enforceOauthRegistrationRateLimit } = await import('@web/lib/request-rate-limiter');

describe('request rate limiting in production without REDIS_URL', () => {
	it('refuses the in-memory fallback and throws instead of silently rate-limiting per-process', async () => {
		await expect(enforceOauthRegistrationRateLimit({ networkIdentity: '1.2.3.4' })).rejects.toThrow(
			'Refusing to rate-limit with the in-memory fallback in production. REDIS_URL must be set.',
		);
	});
});
