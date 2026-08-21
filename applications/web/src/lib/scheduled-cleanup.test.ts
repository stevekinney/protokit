import { describe, expect, it } from 'bun:test';
import { deleteAsPrimaryKeyBatches } from '@web/lib/scheduled-cleanup';

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
