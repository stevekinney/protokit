import { beforeEach, describe, expect, it } from 'bun:test';
import {
	claimSingleUse,
	resetGoogleOauthSingleUseStoreForTests,
} from '@web/lib/google-oauth-single-use-store';

beforeEach(() => {
	resetGoogleOauthSingleUseStoreForTests();
});

const inMemoryDependencies = {
	isRedisConfigured: () => false,
	getRedisClient: async () => {
		throw new Error('Redis should not be used when isRedisConfigured() is false.');
	},
	now: () => Date.now(),
};

describe('claimSingleUse (in-memory fallback)', () => {
	it('returns true the first time a key is claimed', async () => {
		const claimed = await claimSingleUse('key-a', 1000, inMemoryDependencies);
		expect(claimed).toBe(true);
	});

	it('returns false on a second claim of the same key', async () => {
		await claimSingleUse('key-b', 1000, inMemoryDependencies);
		const secondClaim = await claimSingleUse('key-b', 1000, inMemoryDependencies);
		expect(secondClaim).toBe(false);
	});

	it('allows two different keys to be claimed independently', async () => {
		const first = await claimSingleUse('key-c', 1000, inMemoryDependencies);
		const second = await claimSingleUse('key-d', 1000, inMemoryDependencies);
		expect(first).toBe(true);
		expect(second).toBe(true);
	});

	it('allows a key to be reclaimed after its TTL has elapsed', async () => {
		let currentTime = 1_000_000;
		const dependencies = { ...inMemoryDependencies, now: () => currentTime };

		const first = await claimSingleUse('key-e', 100, dependencies);
		currentTime += 200;
		const second = await claimSingleUse('key-e', 100, dependencies);

		expect(first).toBe(true);
		expect(second).toBe(true);
	});

	it('survives many concurrent claim attempts on the same key with exactly one winner', async () => {
		const results = await Promise.all(
			Array.from({ length: 20 }, () => claimSingleUse('key-race', 1000, inMemoryDependencies)),
		);
		expect(results.filter(Boolean).length).toBe(1);
	});
});

describe('claimSingleUse (Redis path)', () => {
	it('claims the key via a NX/PX SET and reports the winner', async () => {
		const store = new Map<string, boolean>();
		const fakeRedisClient = {
			set: async (key: string, _value: string, options: { condition?: string }) => {
				if (options.condition === 'NX' && store.has(key)) return null;
				store.set(key, true);
				return 'OK';
			},
		};
		const dependencies = {
			isRedisConfigured: () => true,
			getRedisClient: async () => fakeRedisClient as never,
			now: () => Date.now(),
		};

		const first = await claimSingleUse('redis-key', 1000, dependencies);
		const second = await claimSingleUse('redis-key', 1000, dependencies);

		expect(first).toBe(true);
		expect(second).toBe(false);
	});
});
