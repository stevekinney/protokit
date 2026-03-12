import { describe, it, expect } from 'vitest';
import { SlidingWindowRateLimiter } from '$lib/sliding-window-rate-limiter';

class InMemorySortedSetStore {
	private readonly values = new Map<string, Array<{ score: number; member: string }>>();

	async removeRangeByScore(key: string, minimumScore: number, maximumScore: number): Promise<void> {
		const existing = this.values.get(key) ?? [];
		this.values.set(
			key,
			existing.filter((entry) => entry.score < minimumScore || entry.score > maximumScore),
		);
	}

	async count(key: string): Promise<number> {
		return (this.values.get(key) ?? []).length;
	}

	async add(key: string, score: number, member: string): Promise<void> {
		const existing = this.values.get(key) ?? [];
		existing.push({ score, member });
		existing.sort((left, right) => left.score - right.score);
		this.values.set(key, existing);
	}

	async getOldestScore(key: string): Promise<number | null> {
		const oldest = (this.values.get(key) ?? [])[0];
		return oldest?.score ?? null;
	}

	async expire(key: string, seconds: number): Promise<void> {
		void key;
		void seconds;
		// No expiration behavior is required for deterministic unit tests.
	}
}

describe('SlidingWindowRateLimiter', () => {
	it('allows requests until the maximum and then blocks', async () => {
		let currentTimeMilliseconds = 1_000;
		const limiter = new SlidingWindowRateLimiter(() => currentTimeMilliseconds);
		const sortedSetStore = new InMemorySortedSetStore();

		const first = await limiter.consume({
			key: 'rate_limit:test:one',
			maximumRequests: 2,
			windowSeconds: 60,
			sortedSetStore,
		});
		expect(first.allowed).toBe(true);

		currentTimeMilliseconds += 1;
		const second = await limiter.consume({
			key: 'rate_limit:test:one',
			maximumRequests: 2,
			windowSeconds: 60,
			sortedSetStore,
		});
		expect(second.allowed).toBe(true);

		currentTimeMilliseconds += 1;
		const blocked = await limiter.consume({
			key: 'rate_limit:test:one',
			maximumRequests: 2,
			windowSeconds: 60,
			sortedSetStore,
		});
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
	});

	it('allows requests again after the window elapses', async () => {
		let currentTimeMilliseconds = 10_000;
		const limiter = new SlidingWindowRateLimiter(() => currentTimeMilliseconds);
		const sortedSetStore = new InMemorySortedSetStore();

		await limiter.consume({
			key: 'rate_limit:test:two',
			maximumRequests: 1,
			windowSeconds: 30,
			sortedSetStore,
		});

		currentTimeMilliseconds += 31_000;
		const allowed = await limiter.consume({
			key: 'rate_limit:test:two',
			maximumRequests: 1,
			windowSeconds: 30,
			sortedSetStore,
		});

		expect(allowed.allowed).toBe(true);
	});
});
