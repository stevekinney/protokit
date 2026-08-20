import { describe, it, expect, beforeEach } from 'bun:test';
import {
	inMemorySlidingWindowStore,
	resetInMemorySlidingWindowStore,
} from '@web/lib/in-memory-sliding-window-store';
import { SlidingWindowRateLimiter } from '@web/lib/sliding-window-rate-limiter';

describe('SlidingWindowRateLimiter', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('allows requests until the maximum and then blocks', async () => {
		let currentTimeMilliseconds = 1_000;
		const limiter = new SlidingWindowRateLimiter(() => currentTimeMilliseconds);

		const first = await limiter.consume({
			key: 'rate_limit:test:one',
			maximumRequests: 2,
			windowSeconds: 60,
			atomicStore: inMemorySlidingWindowStore,
		});
		expect(first.allowed).toBe(true);

		currentTimeMilliseconds += 1;
		const second = await limiter.consume({
			key: 'rate_limit:test:one',
			maximumRequests: 2,
			windowSeconds: 60,
			atomicStore: inMemorySlidingWindowStore,
		});
		expect(second.allowed).toBe(true);

		currentTimeMilliseconds += 1;
		const blocked = await limiter.consume({
			key: 'rate_limit:test:one',
			maximumRequests: 2,
			windowSeconds: 60,
			atomicStore: inMemorySlidingWindowStore,
		});
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
	});

	it('allows requests again after the window elapses', async () => {
		let currentTimeMilliseconds = 10_000;
		const limiter = new SlidingWindowRateLimiter(() => currentTimeMilliseconds);

		await limiter.consume({
			key: 'rate_limit:test:two',
			maximumRequests: 1,
			windowSeconds: 30,
			atomicStore: inMemorySlidingWindowStore,
		});

		currentTimeMilliseconds += 31_000;
		const allowed = await limiter.consume({
			key: 'rate_limit:test:two',
			maximumRequests: 1,
			windowSeconds: 30,
			atomicStore: inMemorySlidingWindowStore,
		});

		expect(allowed.allowed).toBe(true);
	});

	it('reports the current member count via peek without mutating state', async () => {
		const limiter = new SlidingWindowRateLimiter(() => 5_000);

		await limiter.consume({
			key: 'rate_limit:test:three',
			maximumRequests: 5,
			windowSeconds: 60,
			atomicStore: inMemorySlidingWindowStore,
		});

		const countAfterOneConsume = await limiter.peek({
			key: 'rate_limit:test:three',
			windowSeconds: 60,
			atomicStore: inMemorySlidingWindowStore,
		});
		expect(countAfterOneConsume).toBe(1);

		const countAgain = await limiter.peek({
			key: 'rate_limit:test:three',
			windowSeconds: 60,
			atomicStore: inMemorySlidingWindowStore,
		});
		expect(countAgain).toBe(1);
	});

	it('admits exactly the configured maximum when many requests race concurrently', async () => {
		const maximumRequests = 5;
		const totalConcurrentRequests = maximumRequests * 4;
		const limiter = new SlidingWindowRateLimiter(() => 1_000);

		const results = await Promise.all(
			Array.from({ length: totalConcurrentRequests }, () =>
				limiter.consume({
					key: 'rate_limit:test:race',
					maximumRequests,
					windowSeconds: 60,
					atomicStore: inMemorySlidingWindowStore,
				}),
			),
		);

		const allowedCount = results.filter((result) => result.allowed).length;
		expect(allowedCount).toBe(maximumRequests);
	});
});
