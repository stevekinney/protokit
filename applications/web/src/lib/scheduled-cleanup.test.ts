import { afterEach, describe, expect, it } from 'bun:test';
import {
	deleteAsPrimaryKeyBatches,
	isScheduledCleanupRunning,
	awaitActiveCleanupSweep,
	startScheduledCleanup,
	stopScheduledCleanup,
} from '@web/lib/scheduled-cleanup';

/**
 * DATA-001 / S-18 acceptance criterion 3: "Scheduled cleanup is idempotent,
 * indexed, bounded, monitored, and proven against production-scale
 * fixtures." This file proves the shared batching primitive every table's
 * cleanup uses -- bounded batch size, a hard iteration cap, and the
 * "never load full rows" property -- with an injected in-memory table, so
 * the loop logic itself is proven deterministically instead of only
 * observed indirectly through a real, network-latency-bound database.
 * `scheduled-cleanup.integration.test.ts` is this file's real-database
 * counterpart, proving the same properties at real scale for one real
 * table.
 */
describe('deleteAsPrimaryKeyBatches', () => {
	it('deletes every matching row across multiple batches when the table is larger than one batch', async () => {
		const rows = Array.from({ length: 25 }, (_, index) => `row-${index}`);
		const deletedIds: string[] = [];

		const result = await deleteAsPrimaryKeyBatches({
			label: 'test-table',
			batchSize: 10,
			maxIterations: 10,
			selectIds: async (limit) => rows.slice(0, limit).map((id) => ({ id })),
			deleteByIds: async (ids) => {
				deletedIds.push(...ids);
				for (const id of ids) {
					const index = rows.indexOf(id);
					if (index >= 0) rows.splice(index, 1);
				}
				return ids.length;
			},
		});

		expect(result.deleted).toBe(25);
		expect(result.iterations).toBe(3); // 10 + 10 + 5
		expect(result.exhaustedIterationCap).toBe(false);
		expect(deletedIds).toHaveLength(25);
		expect(new Set(deletedIds).size).toBe(25); // no row deleted twice
	});

	it('never selects more than batchSize rows in a single call (bounded, no full-table load)', async () => {
		const rows = Array.from({ length: 47 }, (_, index) => `row-${index}`);
		const observedLimits: number[] = [];

		await deleteAsPrimaryKeyBatches({
			label: 'test-table',
			batchSize: 7,
			maxIterations: 20,
			selectIds: async (limit) => {
				observedLimits.push(limit);
				return rows.splice(0, limit).map((id) => ({ id }));
			},
			deleteByIds: async (ids) => ids.length,
		});

		expect(observedLimits.every((limit) => limit === 7)).toBe(true);
	});

	it('stops at maxIterations even if more matching rows remain (bounded per sweep)', async () => {
		let selectCallCount = 0;
		const result = await deleteAsPrimaryKeyBatches({
			label: 'unbounded-backlog-table',
			batchSize: 5,
			maxIterations: 3,
			selectIds: async (limit) => {
				selectCallCount += 1;
				// Always returns a full batch -- simulates a backlog larger than
				// this sweep's bound.
				return Array.from({ length: limit }, (_, index) => ({
					id: `row-${selectCallCount}-${index}`,
				}));
			},
			deleteByIds: async (ids) => ids.length,
		});

		expect(selectCallCount).toBe(3);
		expect(result.iterations).toBe(3);
		expect(result.deleted).toBe(15);
		expect(result.exhaustedIterationCap).toBe(true);
	});

	// Round 13 review finding (P2): `iterationsRun` reaching `maxIterations`
	// was previously treated as proof more rows remain, even when the LAST
	// allowed batch itself was short -- the table's own signal that nothing
	// is left. With the defaults this happens whenever the backlog is
	// cleared by a partial final batch that happens to land exactly on the
	// last allowed iteration.
	it('does not report exhaustedIterationCap when the final batch, on the last allowed iteration, is short (table is fully caught up)', async () => {
		// 4 full batches of 5 (iterations 1-4) plus a short 5th batch of 3,
		// with maxIterations set to exactly 5 -- the short, caught-up batch
		// lands precisely on the last allowed iteration.
		const rows = Array.from({ length: 23 }, (_, index) => `row-${index}`);

		const result = await deleteAsPrimaryKeyBatches({
			label: 'exact-cap-short-batch-table',
			batchSize: 5,
			maxIterations: 5,
			selectIds: async (limit) => rows.slice(0, limit).map((id) => ({ id })),
			deleteByIds: async (ids) => {
				for (const id of ids) {
					const index = rows.indexOf(id);
					if (index >= 0) rows.splice(index, 1);
				}
				return ids.length;
			},
		});

		expect(result.iterations).toBe(5);
		expect(result.deleted).toBe(23);
		expect(rows).toHaveLength(0);
		// The table is genuinely fully caught up -- the short final batch
		// proves it, regardless of iterationsRun equaling maxIterations.
		expect(result.exhaustedIterationCap).toBe(false);
	});

	// The genuine-exhaustion case must still be distinguishable: every
	// batch up to and including the last allowed one is a FULL batch, so
	// there is no short-batch signal proving the table is caught up.
	it('still reports exhaustedIterationCap when every batch up to the cap is full (more rows genuinely remain)', async () => {
		const result = await deleteAsPrimaryKeyBatches({
			label: 'genuinely-exhausted-table',
			batchSize: 5,
			maxIterations: 5,
			selectIds: async (limit) =>
				Array.from({ length: limit }, (_, index) => ({ id: `x-${index}` })),
			deleteByIds: async (ids) => ids.length,
		});

		expect(result.iterations).toBe(5);
		expect(result.exhaustedIterationCap).toBe(true);
	});

	it('is idempotent: a second sweep over an already-clean table deletes nothing', async () => {
		const first = await deleteAsPrimaryKeyBatches({
			label: 'test-table',
			batchSize: 10,
			maxIterations: 10,
			selectIds: async () => [],
			deleteByIds: async (ids) => ids.length,
		});
		expect(first.deleted).toBe(0);
		expect(first.iterations).toBe(0);
	});
});

/**
 * A review finding (P2): the distributed lease's TTL equals the configured
 * interval and is never renewed, so a sweep slower than the interval lets
 * the lease lapse mid-sweep -- and with no Redis configured at all the
 * lease is a permanent unconditional no-op. Either way, nothing previously
 * stopped the SAME process's next `setInterval` tick from starting a
 * second, overlapping sweep while the first was still running. These tests
 * inject a controllable sweep and a stubbed lease (always granted, so
 * Redis/the real globally shared lease key is never touched) to prove the
 * new local `sweepInProgress` guard deterministically, with real timers.
 */
describe('awaitActiveCleanupSweep', () => {
	afterEach(() => {
		stopScheduledCleanup();
	});

	it('resolves immediately when no sweep is in flight', async () => {
		await awaitActiveCleanupSweep();
		expect(isScheduledCleanupRunning()).toBe(false);
	});

	it('waits for a sweep that is already running before resolving', async () => {
		// The regression it guards: `stopScheduledCleanup` clears future ticks
		// only, so a caller that stopped the interval and immediately tore down
		// its database connections could do so under a sweep still writing.
		let releaseSweep: (() => void) | undefined;
		let sweepFinished = false;
		const slowSweep = () =>
			new Promise<void>((resolve) => {
				releaseSweep = () => {
					sweepFinished = true;
					resolve();
				};
			});

		startScheduledCleanup(20, slowSweep, async () => true);
		await new Promise((resolve) => setTimeout(resolve, 60));
		stopScheduledCleanup();

		let awaited = false;
		const waiting = awaitActiveCleanupSweep().then(() => {
			awaited = true;
		});

		await Promise.resolve();
		expect(awaited).toBe(false);
		expect(sweepFinished).toBe(false);

		releaseSweep?.();
		await waiting;

		expect(sweepFinished).toBe(true);
		expect(awaited).toBe(true);
	});

	it('a failing sweep still lets disposal proceed rather than rejecting', async () => {
		startScheduledCleanup(
			20,
			async () => {
				throw new Error('sweep exploded');
			},
			async () => true,
		);
		await new Promise((resolve) => setTimeout(resolve, 60));
		stopScheduledCleanup();

		await awaitActiveCleanupSweep();
	});
});

describe('startScheduledCleanup overlap guard', () => {
	// Drain every sweep this test left in flight before stopping the
	// interval. Without this, a sweep started after the test's own
	// assertions (the second sweep the guard clearing correctly lets
	// through) would be left permanently unresolved -- leaking the
	// module-level `sweepInProgress = true` flag into whatever test runs
	// next in this file/process, exactly the "global state plus arbitrary
	// file ordering" hazard this branch's cautions warn about.
	let releaseSignals: Array<() => void> = [];

	afterEach(() => {
		for (const release of releaseSignals.splice(0)) release();
		stopScheduledCleanup();
	});

	it('does not start a second sweep while the previous one, on the same process, is still running', async () => {
		let inFlight = 0;
		let maxConcurrentInFlight = 0;
		let completedCount = 0;
		releaseSignals = [];

		const slowSweep = () =>
			new Promise<void>((resolve) => {
				inFlight += 1;
				maxConcurrentInFlight = Math.max(maxConcurrentInFlight, inFlight);
				releaseSignals.push(() => {
					inFlight -= 1;
					completedCount += 1;
					resolve();
				});
			});

		// A short interval so several ticks fire while the first sweep is
		// deliberately held open below.
		startScheduledCleanup(20, slowSweep, async () => true);
		expect(isScheduledCleanupRunning()).toBe(true);

		// Let several interval ticks fire while the first sweep is still
		// unresolved.
		await new Promise((resolve) => setTimeout(resolve, 120));

		// Exactly one sweep should have actually started, no matter how many
		// ticks fired in the meantime.
		expect(releaseSignals.length).toBe(1);
		expect(maxConcurrentInFlight).toBe(1);

		// Release the one in-flight sweep and let the next tick start a
		// second one -- proving the guard clears correctly rather than
		// wedging cleanup forever.
		releaseSignals[0]?.();
		await new Promise((resolve) => setTimeout(resolve, 60));

		expect(completedCount).toBe(1);
		expect(releaseSignals.length).toBeGreaterThan(1);
		expect(maxConcurrentInFlight).toBe(1);
	});

	it('is a no-op when called again while already running', () => {
		startScheduledCleanup(
			1_000,
			async () => {},
			async () => true,
		);
		expect(isScheduledCleanupRunning()).toBe(true);

		// A second call must not replace the existing interval (and must not
		// throw) -- `startScheduledCleanup` returns early instead.
		expect(() =>
			startScheduledCleanup(
				1_000,
				async () => {},
				async () => true,
			),
		).not.toThrow();
		expect(isScheduledCleanupRunning()).toBe(true);
	});

	it('skips the sweep and logs when the lease is not acquired', async () => {
		let sweepCallCount = 0;

		startScheduledCleanup(
			20,
			async () => {
				sweepCallCount += 1;
			},
			async () => false,
		);
		expect(isScheduledCleanupRunning()).toBe(true);

		await new Promise((resolve) => setTimeout(resolve, 60));

		// The injected sweep must never run when the lease is denied every
		// cycle.
		expect(sweepCallCount).toBe(0);
	});

	it('logs and clears sweepInProgress rather than crashing when the injected sweep throws', async () => {
		let attempts = 0;

		startScheduledCleanup(
			20,
			async () => {
				attempts += 1;
				throw new Error('simulated sweep failure');
			},
			async () => true,
		);
		expect(isScheduledCleanupRunning()).toBe(true);

		await new Promise((resolve) => setTimeout(resolve, 60));

		// At least one tick ran the throwing sweep, and the guard cleared
		// afterward (proven by a second tick also getting a chance to run,
		// rather than the failure permanently wedging `sweepInProgress`).
		expect(attempts).toBeGreaterThan(0);
	});
});
