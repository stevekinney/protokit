import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createClient } from 'redis';
import { acquireScheduledCleanupLease } from '@web/lib/scheduled-cleanup';

/**
 * A review finding (P2): every replica in a multi-instance deployment
 * started `runScheduledCleanup` on its own independent interval, with
 * nothing coordinating them, so N replicas deployed together multiplied
 * database load and lock contention by N for a job meant to run once per
 * cycle. This proves the fix -- a `SET key value NX PX ttl` lease -- against
 * real Redis: two distinct holder identities simulate two independent
 * replica processes racing for the same lease key.
 */

let redisAvailable: boolean;
try {
	const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
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

// Reconstructs the exact key `scheduled-cleanup.ts` derives internally, so
// this file can clear it between tests -- the lease key is a single fixed
// module constant (only the holder identity varies per call), so without
// this, one test's winning lease could still be held when the next test
// starts and race-condition the next test's own assertion.
const leaseKey = process.env['RATE_LIMIT_KEY_NAMESPACE']
	? `scheduled_cleanup:${process.env['RATE_LIMIT_KEY_NAMESPACE']}:leader_lease`
	: 'scheduled_cleanup:leader_lease';

describeWithRedis('acquireScheduledCleanupLease (requires Redis)', () => {
	beforeEach(async () => {
		const client = createClient({ url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
		await client.connect();
		await client.del(leaseKey);
		await client.disconnect();
	});

	afterEach(async () => {
		const client = createClient({ url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
		await client.connect();
		await client.del(leaseKey);
		await client.disconnect();
	});

	it('only one of two simultaneously-racing replicas acquires the lease for a given cycle', async () => {
		const replicaAId = `replica-a-${randomUUID()}`;
		const replicaBId = `replica-b-${randomUUID()}`;

		const [replicaAAcquired, replicaBAcquired] = await Promise.all([
			acquireScheduledCleanupLease(5_000, replicaAId),
			acquireScheduledCleanupLease(5_000, replicaBId),
		]);

		// Exactly one of the two racing replicas won the lease -- never both
		// (that would mean both replicas run the sweep this cycle, the exact
		// duplicated-work problem this lease exists to prevent) and never
		// neither (that would mean NO replica runs cleanup at all).
		expect([replicaAAcquired, replicaBAcquired].filter(Boolean)).toHaveLength(1);
	});

	it('a replica that already holds the lease is blocked from re-acquiring it before it expires', async () => {
		const replicaId = `replica-solo-${randomUUID()}`;
		const otherReplicaId = `replica-other-${randomUUID()}`;

		const first = await acquireScheduledCleanupLease(2_000, replicaId);
		expect(first).toBe(true);

		// A different replica trying immediately after must be denied -- the
		// lease is still held.
		const second = await acquireScheduledCleanupLease(2_000, otherReplicaId);
		expect(second).toBe(false);
	});

	it('the lease expires and becomes acquirable again after its own duration elapses, so a dead replica never wedges cleanup permanently', async () => {
		const replicaId = `replica-lapsing-${randomUUID()}`;
		const nextReplicaId = `replica-next-${randomUUID()}`;

		const first = await acquireScheduledCleanupLease(150, replicaId);
		expect(first).toBe(true);

		await new Promise((resolve) => setTimeout(resolve, 250));

		const afterExpiry = await acquireScheduledCleanupLease(150, nextReplicaId);
		expect(afterExpiry).toBe(true);
	});
});
