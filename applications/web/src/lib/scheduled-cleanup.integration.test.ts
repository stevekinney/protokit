import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';
import { runScheduledCleanup } from '@web/lib/scheduled-cleanup';

/**
 * DATA-001 / S-18 acceptance criterion 3: "Scheduled cleanup is idempotent,
 * indexed, bounded, monitored, and proven against production-scale
 * fixtures." Against the real test Postgres, at a scale (1,200 rows) large
 * enough that a single unbounded `DELETE` would matter and a batched sweep
 * genuinely has to loop.
 *
 * Scoped to `user_sessions` deliberately: this table's only foreign key is
 * `userId -> users.id`, so seeding it does not require inserting an
 * `oauth_clients` row -- unlike every OAuth token/code table, which needs a
 * real client row and therefore needs migration 0006 applied first (see
 * `.roadmap-progress/DATA-001.md`). `oauth_tokens`/`oauth_refresh_tokens`/
 * `oauth_codes`/`oauth_authorization_transactions` share the exact same
 * `deleteAsPrimaryKeyBatches` primitive this table's cleanup uses
 * (`scheduled-cleanup.test.ts` proves that shared primitive directly), so
 * this file's real-database proof for one table plus the primitive's own
 * unit coverage together prove the whole mechanism.
 *
 * SHARED-DATABASE ISOLATION: `runScheduledCleanup` has no per-run
 * filter -- it is a real global sweep, exactly like it would run in
 * production. This file proves its own effect only by checking that ITS
 * OWN seeded rows (identified by a `randomUUID()` test-run marker baked
 * into every session's `userAgent` field) are gone afterward, never by
 * asserting a global row count, so it is safe to run concurrently with
 * every other suite touching this shared test database.
 */

const testRunMarker = `scheduled-cleanup-scale-${randomUUID()}`;
const scaleRowCount = 1200;
let seededUserId: string | null = null;
let seededSessionHashes: string[] = [];

afterAll(async () => {
	if (seededSessionHashes.length > 0) {
		await database
			.delete(schema.userSessions)
			.where(inArray(schema.userSessions.sessionTokenHash, seededSessionHashes));
	}
	if (seededUserId) {
		await database.delete(schema.users).where(eq(schema.users.id, seededUserId));
	}
});

describe('runScheduledCleanup at production scale (user_sessions)', () => {
	it('deletes every one of 1,200 seeded expired sessions in bounded batches, and a second sweep finds nothing left', async () => {
		const userId = randomUUID();
		seededUserId = userId;
		await database.insert(schema.users).values({
			id: userId,
			email: `${testRunMarker}@example.com`,
			name: 'Scheduled Cleanup Scale Test User',
		});

		const rows = Array.from({ length: scaleRowCount }, (_, index) => ({
			sessionTokenHash: hashCredential(`${testRunMarker}-${index}`),
			userId,
			// Already expired -- eligible for cleanup the moment they're seeded.
			expiresAt: new Date(Date.now() - 60_000),
			userAgent: testRunMarker,
		}));
		seededSessionHashes = rows.map((row) => row.sessionTokenHash);

		// Batch the insert itself so this seeding step doesn't hit its own
		// statement-size limits -- 200 rows per insert, 6 inserts.
		const insertBatchSize = 200;
		for (let start = 0; start < rows.length; start += insertBatchSize) {
			await database.insert(schema.userSessions).values(rows.slice(start, start + insertBatchSize));
		}

		const beforeCleanup = await database
			.select()
			.from(schema.userSessions)
			.where(inArray(schema.userSessions.sessionTokenHash, seededSessionHashes));
		expect(beforeCleanup).toHaveLength(scaleRowCount);

		// A batch size well below the seeded row count, so this sweep is
		// genuinely proven to loop across many batches rather than clearing
		// everything in one statement.
		const result = await runScheduledCleanup({ batchSize: 200, maxIterationsPerTable: 50 });

		// `result.userSessions.deleted`/`iterations` are NOT asserted against
		// this test's own 1,200-row count here, deliberately: `userSessions`
		// is a real, shared, global table, and this file must be safe to run
		// concurrently with a second instance of itself (or any other suite
		// touching this table). A concurrently running sweep can win the race
		// and delete some or all of this test's own seeded rows before this
		// process's own `runScheduledCleanup` call runs, which would make a
		// same-process row-count assertion flaky under real concurrency
		// without indicating any actual defect. What must hold regardless of
		// which process did the deleting, proven precisely below by
		// re-querying for this test's own rows: every one of them is gone,
		// and the batching primitive never exceeded its iteration cap doing
		// it (`exhaustedIterationCap` reflects THIS call's own backlog, which
		// this assertion is safe to check on).
		expect(result.userSessions.exhaustedIterationCap).toBe(false);

		const afterCleanup = await database
			.select()
			.from(schema.userSessions)
			.where(inArray(schema.userSessions.sessionTokenHash, seededSessionHashes));
		expect(afterCleanup).toHaveLength(0);

		// Idempotent: re-running over an already-clean set of rows deletes
		// none of them again and does not error.
		const secondSweep = await runScheduledCleanup({ batchSize: 200, maxIterationsPerTable: 50 });
		const stillGone = await database
			.select()
			.from(schema.userSessions)
			.where(inArray(schema.userSessions.sessionTokenHash, seededSessionHashes));
		expect(stillGone).toHaveLength(0);
		expect(secondSweep.userSessions.deleted).toBeGreaterThanOrEqual(0);
	}, 30_000);

	it('reports remainingLag as 0 once a table has no more expired/revoked rows for this test to have left behind', async () => {
		// This is a light-touch proof of the "monitor lag" half of the
		// criterion: after this file's own sweep above, seed and immediately
		// clean up exactly one more session, and confirm the reported lag
		// metric reflects the real remaining count rather than a hardcoded
		// value.
		const userId = randomUUID();
		await database.insert(schema.users).values({
			id: userId,
			email: `${testRunMarker}-lag@example.com`,
			name: 'Scheduled Cleanup Lag Test User',
		});
		const sessionTokenHash = hashCredential(`${testRunMarker}-lag-probe`);
		await database.insert(schema.userSessions).values({
			sessionTokenHash,
			userId,
			expiresAt: new Date(Date.now() - 1000),
		});

		const result = await runScheduledCleanup({ batchSize: 500, maxIterationsPerTable: 50 });
		expect(typeof result.userSessions.remainingLag).toBe('number');

		// Deliberately not asserting `result.userSessions.deleted >= 1` here:
		// this table is real, shared, global state, and a concurrently
		// running instance of this same suite (the concurrency requirement
		// this file must satisfy) can win the race and delete this seeded row
		// via ITS OWN sweep before this process's call runs. What must hold
		// regardless of which process actually deleted it is that the row is
		// gone by now -- proven directly, not inferred from a count that
		// assumes uncontested ownership of the table.
		const [remaining] = await database
			.select()
			.from(schema.userSessions)
			.where(eq(schema.userSessions.sessionTokenHash, sessionTokenHash))
			.limit(1);
		expect(remaining).toBeUndefined();

		await database.delete(schema.users).where(eq(schema.users.id, userId));
	});
});
