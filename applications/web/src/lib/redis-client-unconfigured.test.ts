import { describe, expect, it, mock } from 'bun:test';

/**
 * Exercises `redis-client.ts`'s "Redis is not configured" branches, which
 * `redis-client.test.ts` (real, reachable Redis) and
 * `redis-client-unreachable.test.ts` (configured but unreachable) cannot
 * reach: `getRedisClient`'s singleton caches its client for the life of the
 * module, so this must be the very first thing that calls it in a fresh
 * process, before any successful connect populates the cache. This file
 * exists purely to control that ordering under `--isolate` (one process per
 * test file).
 */
mock.module('@web/env', () => ({
	environment: { REDIS_URL: undefined },
}));

const { isRedisConfigured, isRedisHealthy, getRedisClient, disconnectRedisSubscriberClient } =
	await import('@web/lib/redis-client');

describe('redis-client without REDIS_URL configured', () => {
	it('isRedisConfigured reports false', () => {
		expect(isRedisConfigured()).toBe(false);
	});

	it('isRedisHealthy resolves false without probing anything', async () => {
		expect(await isRedisHealthy()).toBe(false);
	});

	it('getRedisClient rejects with a descriptive error rather than attempting to connect', async () => {
		await expect(getRedisClient()).rejects.toThrow(
			'Redis is not configured. Set REDIS_URL to enable Redis-backed features.',
		);
	});

	it('disconnectRedisSubscriberClient returns immediately without a subscriber client', async () => {
		expect(await disconnectRedisSubscriberClient()).toBeUndefined();
	});
});
