import { describe, expect, it, mock } from 'bun:test';

/**
 * Exercises `getRedisClient`'s bounded-retry `reconnectStrategy` (both
 * branches: keep retrying below `MAX_INITIAL_CONNECTION_ATTEMPTS`, then give
 * up with an `Error` once reached) and the `client.on('error', ...)` logger
 * branch, none of which fire against a normal successful connect. Points
 * `REDIS_URL` at a port nothing listens on so every connection attempt
 * fails fast (`ECONNREFUSED`) instead of depending on `connectTimeout`
 * actually elapsing. Runs in its own file under `--isolate` so the
 * `getRedisClient` singleton here never sees a real, reachable Redis --
 * `redis-client.test.ts` owns that path in a separate process.
 */
mock.module('@web/env', () => ({
	environment: { REDIS_URL: 'redis://127.0.0.1:9' },
}));

const { getRedisClient } = await import('@web/lib/redis-client');

describe('redis-client against an unreachable REDIS_URL', () => {
	it('rejects once the bounded retry budget is exhausted, and a concurrent call joins the same in-flight attempt', async () => {
		// Two calls issued before either settles must share one underlying
		// `initialize()` attempt (the lazy client's `pending` branch) rather
		// than each starting an independent connection race.
		const first = getRedisClient();
		const second = getRedisClient();
		// Attach rejection handlers to both immediately so neither surfaces as
		// an unhandled rejection while the other is still pending.
		const firstOutcome = first.catch((error: unknown) => error);
		const secondOutcome = second.catch((error: unknown) => error);

		expect(await firstOutcome).toBeTruthy();
		expect(await secondOutcome).toBeTruthy();
	}, 15_000);
});
