import { describe, expect, it, mock } from 'bun:test';

/**
 * `acquireScheduledCleanupLease`'s catch branch: "Redis being unreachable
 * must not silently stop cleanup from ever running again -- fail open (run
 * the sweep) rather than fail closed." `scheduled-cleanup-lease.test.ts`
 * proves the lease against real, reachable Redis, which can never exercise
 * this branch. Mocks `@web/lib/redis-client` so `getRedisClient()` rejects
 * while `isRedisConfigured()` still reports true (otherwise the function
 * returns early before ever reaching Redis at all). Runs in its own file
 * under `--isolate` so the mock can't leak into any real-Redis lease test.
 */
mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => true,
	isRedisHealthy: async () => false,
	getRedisClient: async () => {
		throw new Error('simulated Redis outage');
	},
	getRedisSubscriberClient: async () => {
		throw new Error('simulated Redis outage');
	},
	disconnectRedisSubscriberClient: async () => {},
}));

const { acquireScheduledCleanupLease } = await import('@web/lib/scheduled-cleanup');

describe('acquireScheduledCleanupLease when Redis is configured but unreachable', () => {
	it('fails open (returns true, letting the sweep run) rather than throwing', async () => {
		const acquired = await acquireScheduledCleanupLease(5_000, 'unreachable-redis-holder');
		expect(acquired).toBe(true);
	});
});
