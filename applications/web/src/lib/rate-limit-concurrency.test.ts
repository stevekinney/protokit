import { describe, expect, it, beforeEach } from 'bun:test';
import { createClient } from 'redis';
import {
	inMemorySlidingWindowStore,
	resetInMemorySlidingWindowStore,
} from '@web/lib/in-memory-sliding-window-store';
import { SlidingWindowRateLimiter } from '@web/lib/sliding-window-rate-limiter';

/**
 * This file backs `bun run test:rate-limit-concurrency` (SEC-003
 * verification). It proves the limiter is genuinely atomic under real
 * concurrency — not merely correct when called in a sequential loop — by
 * firing at least twice the configured maximum requests at the same key
 * through `Promise.all` and asserting exactly the configured maximum was
 * admitted.
 */

async function raceAtWindowBoundary(input: {
	atomicStore: Parameters<SlidingWindowRateLimiter['consume']>[0]['atomicStore'];
	maximumRequests: number;
	key: string;
}): Promise<void> {
	const totalConcurrentRequests = input.maximumRequests * 2;
	const limiter = new SlidingWindowRateLimiter(() => 1_000);

	const results = await Promise.all(
		Array.from({ length: totalConcurrentRequests }, () =>
			limiter.consume({
				key: input.key,
				maximumRequests: input.maximumRequests,
				windowSeconds: 60,
				atomicStore: input.atomicStore,
			}),
		),
	);

	const allowedCount = results.filter((result) => result.allowed).length;
	const deniedCount = results.length - allowedCount;

	expect(allowedCount).toBe(input.maximumRequests);
	expect(deniedCount).toBe(totalConcurrentRequests - input.maximumRequests);
}

describe('rate limit concurrency (in-memory store)', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('admits exactly the configured maximum when 2x that many requests race at the window boundary', async () => {
		await raceAtWindowBoundary({
			atomicStore: inMemorySlidingWindowStore,
			maximumRequests: 10,
			key: 'rate_limit:concurrency-test:in-memory',
		});
	});

	it('admits exactly the configured maximum for a tight limit under heavy concurrency', async () => {
		await raceAtWindowBoundary({
			atomicStore: inMemorySlidingWindowStore,
			maximumRequests: 3,
			key: 'rate_limit:concurrency-test:in-memory-tight',
		});
	});
});

// Deliberately does not go through `@web/lib/redis-client` or `@web/env`:
// several other files in this suite call `mock.module('@web/env', ...)` with
// a fake environment that omits `REDIS_URL`, and Bun's `mock.module` patches
// the shared module registry for the rest of the test process, not just the
// mocking file. Depending on either module here made this file's Redis
// availability check (and therefore this whole `describe` block) silently
// resolve to "unavailable" whenever an earlier file's env mock happened to
// still be in effect — an unexplained skip masking as "no Redis configured".
// Building the client straight from `process.env.REDIS_URL` sidesteps that
// entirely and makes this file's outcome independent of any other file's
// mocking.
const redisUrl = process.env.REDIS_URL;

let redisAvailable: boolean;
try {
	if (!redisUrl) {
		throw new Error('REDIS_URL is not set');
	}
	const probe = createClient({
		url: redisUrl,
		socket: { reconnectStrategy: false, connectTimeout: 2000 },
	});
	try {
		await probe.connect();
		await probe.ping();
		redisAvailable = true;
	} finally {
		await probe.disconnect().catch(() => {});
	}
} catch {
	redisAvailable = false;
}

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

describeWithRedis('rate limit concurrency (Redis-backed store, requires Redis)', () => {
	it('admits exactly the configured maximum when 2x that many requests race at the window boundary', async () => {
		const { createRedisSlidingWindowStore } = await import('@web/lib/redis-sliding-window-store');
		const redisClient = createClient({ url: redisUrl });
		await redisClient.connect();
		const store = createRedisSlidingWindowStore(redisClient);
		const key = `rate_limit:concurrency-test:redis:${crypto.randomUUID()}`;
		await redisClient.del(key);

		try {
			await raceAtWindowBoundary({ atomicStore: store, maximumRequests: 10, key });
		} finally {
			await redisClient.del(key);
			await redisClient.disconnect().catch(() => {});
		}
	});
});
