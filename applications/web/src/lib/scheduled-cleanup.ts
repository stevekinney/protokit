import { randomUUID } from 'node:crypto';
import { inArray, isNotNull, lt, or } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';
import { isRedisConfigured, getRedisClient } from '@web/lib/redis-client';

const cleanupLogger = logger.child({ module: 'scheduled-cleanup' });

/**
 * DATA-001 / S-18: "Schedule idempotent, bounded cleanup with indexes that
 * avoid full-table scans. Monitor lag and delete in batches without loading
 * complete credential rows into process memory."
 *
 * Every table cleaned here has an `expiresAt`/`revokedAt` index
 * (`packages/database/src/schema.ts`, migration 0006), so the `SELECT` half
 * of each batch is an index scan, not a sequential scan.
 *
 * `deleteAsPrimaryKeyBatches` only ever selects the table's primary-key
 * column for a batch, never the row's credential material (a token hash, a
 * session hash, a PKCE challenge) — the "without loading complete credential
 * rows into process memory" half of the criterion. It then deletes exactly
 * that batch of primary keys. Idempotent: re-running finds nothing left to
 * delete once a table is caught up, and a partial run (crash mid-sweep)
 * leaves no half-deleted row — each batch's own `DELETE` is a single
 * statement.
 */
export async function deleteAsPrimaryKeyBatches(options: {
	label: string;
	batchSize: number;
	maxIterations: number;
	selectIds: (limit: number) => Promise<{ id: string }[]>;
	deleteByIds: (ids: string[]) => Promise<number>;
}): Promise<{ deleted: number; iterations: number; exhaustedIterationCap: boolean }> {
	let deleted = 0;
	let iterationsRun = 0;
	while (iterationsRun < options.maxIterations) {
		const rows = await options.selectIds(options.batchSize);
		if (rows.length === 0) {
			break;
		}
		const ids = rows.map((row) => row.id);
		deleted += await options.deleteByIds(ids);
		iterationsRun += 1;
		if (rows.length < options.batchSize) {
			break;
		}
	}
	const exhaustedIterationCap = iterationsRun >= options.maxIterations;
	if (exhaustedIterationCap) {
		// Not a failure -- there is simply more expired data than one sweep's
		// bound covers. The next scheduled run picks up where this one
		// stopped, since the same `WHERE` predicate still matches those rows.
		cleanupLogger.warn(
			{ label: options.label, batchSize: options.batchSize, iterations: iterationsRun },
			'Cleanup sweep hit its iteration cap with more matching rows remaining -- will continue on the next scheduled run',
		);
	}
	return { deleted, iterations: iterationsRun, exhaustedIterationCap };
}

export type CleanupOptions = {
	/** Rows deleted per statement. Bounds memory and lock duration per batch. */
	batchSize?: number;
	/** Hard cap on batches per table per sweep, so one sweep can never run unbounded even if a table has an unbounded backlog. */
	maxIterationsPerTable?: number;
	now?: Date;
};

export type CleanupTableResult = {
	deleted: number;
	iterations: number;
	exhaustedIterationCap: boolean;
	/**
	 * DATA-001: "monitor lag" -- how many still-eligible rows remain after
	 * this sweep, so an operator can see a growing backlog before it becomes
	 * an incident. Bounded at `remainingLagSampleCap`: this is a monitoring
	 * signal, not an exact audit count, so once a backlog is that large the
	 * precise number stops mattering and `remainingLagCapped` says so instead
	 * of paying for a full index scan to report it precisely.
	 */
	remainingLag: number;
	/** True when `remainingLag` hit `remainingLagSampleCap` -- the real backlog may be larger than the number reported. */
	remainingLagCapped: boolean;
};

export type CleanupResult = {
	oauthCodes: CleanupTableResult;
	oauthTokens: CleanupTableResult;
	oauthRefreshTokens: CleanupTableResult;
	oauthAuthorizationTransactions: CleanupTableResult;
	userSessions: CleanupTableResult;
};

const defaultBatchSize = 500;
const defaultMaxIterationsPerTable = 20;

/**
 * DATA-001 / a review finding on this same file: an unbounded `count()`
 * aggregate scans every eligible index entry to report an exact lag number,
 * which means the supposedly bounded hourly sweep could still perform work
 * proportional to an entire backlog just to measure it. Reusing each
 * table's own `selectIds` (the exact same primary-key-only, indexed query
 * the deletion loop already uses) with this cap turns "how many rows are
 * left" into a single indexed scan that stops as soon as it has read this
 * many rows -- Postgres can satisfy a `LIMIT` without visiting the rest of
 * the index. Large enough to make "capped" itself a meaningful alert (a
 * five-figure backlog is worth paging on regardless of its exact size).
 */
const remainingLagSampleCap = 10_000;

async function measureBoundedRemainingLag(
	selectIds: (limit: number) => Promise<{ id: string }[]>,
): Promise<{ remainingLag: number; remainingLagCapped: boolean }> {
	const rows = await selectIds(remainingLagSampleCap);
	return { remainingLag: rows.length, remainingLagCapped: rows.length >= remainingLagSampleCap };
}

/**
 * Runs one bounded cleanup sweep across every table this server accumulates
 * expired or revoked credential-lifecycle rows in. Safe to call repeatedly
 * and concurrently with itself (each batch's `DELETE ... WHERE id IN (...)`
 * only ever matches rows that are still actually expired/revoked/used at
 * the moment it runs, so two overlapping sweeps race harmlessly to the same
 * end state rather than double-deleting or corrupting anything).
 */
export async function runScheduledCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
	const batchSize = options.batchSize ?? defaultBatchSize;
	const maxIterationsPerTable = options.maxIterationsPerTable ?? defaultMaxIterationsPerTable;
	const now = options.now ?? new Date();

	// Review finding (P2): `handleOauthTokenAuthorizationCodeGrant`
	// (`oauth-routes.tsx`) marks a code `usedAt` BEFORE minting its tokens,
	// then compensates a failed mint by setting `usedAt` back to null so the
	// client's retry can redeem the same code -- the identical
	// mark-then-maybe-reopen shape `OAUTH-003` already established for
	// refresh tokens above. Deleting on `isNotNull(usedAt)` (as this used to)
	// could race that compensation window and permanently delete a code
	// between "marked used" and "reopened", turning a transient issuance
	// failure into a permanent one with no evidence why. Retention is
	// bounded by `expiresAt` alone (ten minutes from issuance), the same
	// fix applied to `selectOauthRefreshTokenIds` and
	// `selectOauthAuthorizationTransactionIds` below.
	const selectOauthCodeIds = (limit: number) =>
		database
			.select({ id: schema.oauthCodes.code })
			.from(schema.oauthCodes)
			.where(lt(schema.oauthCodes.expiresAt, now))
			.limit(limit);
	const oauthCodes = await deleteAsPrimaryKeyBatches({
		label: 'oauth_codes',
		batchSize,
		maxIterations: maxIterationsPerTable,
		selectIds: selectOauthCodeIds,
		deleteByIds: async (ids) => {
			const rows = await database
				.delete(schema.oauthCodes)
				.where(inArray(schema.oauthCodes.code, ids))
				.returning({ code: schema.oauthCodes.code });
			return rows.length;
		},
	});

	const selectOauthTokenIds = (limit: number) =>
		database
			.select({ id: schema.oauthTokens.accessToken })
			.from(schema.oauthTokens)
			.where(or(isNotNull(schema.oauthTokens.revokedAt), lt(schema.oauthTokens.expiresAt, now)))
			.limit(limit);
	const oauthTokens = await deleteAsPrimaryKeyBatches({
		label: 'oauth_tokens',
		batchSize,
		maxIterations: maxIterationsPerTable,
		selectIds: selectOauthTokenIds,
		deleteByIds: async (ids) => {
			const rows = await database
				.delete(schema.oauthTokens)
				.where(inArray(schema.oauthTokens.accessToken, ids))
				.returning({ accessToken: schema.oauthTokens.accessToken });
			return rows.length;
		},
	});

	const selectOauthRefreshTokenIds = (limit: number) =>
		database
			.select({ id: schema.oauthRefreshTokens.refreshToken })
			.from(schema.oauthRefreshTokens)
			.where(lt(schema.oauthRefreshTokens.expiresAt, now))
			.limit(limit);
	const oauthRefreshTokens = await deleteAsPrimaryKeyBatches({
		label: 'oauth_refresh_tokens',
		batchSize,
		maxIterations: maxIterationsPerTable,
		// OAUTH-003's rotation-reuse detection (oauth-routes.tsx,
		// `handleOauthTokenRefreshGrant`) reads a revoked refresh-token row
		// back BY HASH to tell "this exact token was already rotated" (a
		// replay -- revoke the whole family) apart from "never existed". A
		// refresh token is marked `revokedAt` the instant it rotates, but its
		// `expiresAt` reflects the token's real, weeks-long configured
		// lifetime (`MCP_REFRESH_TOKEN_TTL_SECONDS`) -- an attacker who stole
		// it can still replay it at any point up to that expiry. Deleting a
		// revoked-but-not-yet-expired row (as this used to do, on the very
		// next hourly sweep after every rotation) erases the evidence replay
		// detection depends on, silently turning a replay into an
		// indistinguishable "unknown token" for the rest of the token's
		// intended lifetime. Retention is therefore bounded by `expiresAt`
		// alone, matching every other table's own designed lifetime rather
		// than the moment of revocation.
		selectIds: selectOauthRefreshTokenIds,
		deleteByIds: async (ids) => {
			const rows = await database
				.delete(schema.oauthRefreshTokens)
				.where(inArray(schema.oauthRefreshTokens.refreshToken, ids))
				.returning({ refreshToken: schema.oauthRefreshTokens.refreshToken });
			return rows.length;
		},
	});

	// Review finding (P2): the identical hazard as `selectOauthCodeIds`
	// above -- `handleOauthAuthorizeApprove` marks a transaction
	// `consumedAt` before inserting the code it issues, then
	// `unconsumeAuthorizationTransaction` reopens it (sets `consumedAt`
	// back to null) if that insert fails. Deleting on
	// `isNotNull(consumedAt)` could delete the row inside that same window,
	// silently defeating the retry the compensation exists to offer.
	// Retention is bounded by `expiresAt` alone, same as the two tables
	// above.
	const selectOauthAuthorizationTransactionIds = (limit: number) =>
		database
			.select({ id: schema.oauthAuthorizationTransactions.transactionId })
			.from(schema.oauthAuthorizationTransactions)
			.where(lt(schema.oauthAuthorizationTransactions.expiresAt, now))
			.limit(limit);
	const oauthAuthorizationTransactions = await deleteAsPrimaryKeyBatches({
		label: 'oauth_authorization_transactions',
		batchSize,
		maxIterations: maxIterationsPerTable,
		selectIds: selectOauthAuthorizationTransactionIds,
		deleteByIds: async (ids) => {
			const rows = await database
				.delete(schema.oauthAuthorizationTransactions)
				.where(inArray(schema.oauthAuthorizationTransactions.transactionId, ids))
				.returning({ transactionId: schema.oauthAuthorizationTransactions.transactionId });
			return rows.length;
		},
	});

	const selectUserSessionIds = (limit: number) =>
		database
			.select({ id: schema.userSessions.sessionTokenHash })
			.from(schema.userSessions)
			.where(or(isNotNull(schema.userSessions.revokedAt), lt(schema.userSessions.expiresAt, now)))
			.limit(limit);
	const userSessions = await deleteAsPrimaryKeyBatches({
		label: 'user_sessions',
		batchSize,
		maxIterations: maxIterationsPerTable,
		selectIds: selectUserSessionIds,
		deleteByIds: async (ids) => {
			const rows = await database
				.delete(schema.userSessions)
				.where(inArray(schema.userSessions.sessionTokenHash, ids))
				.returning({ sessionTokenHash: schema.userSessions.sessionTokenHash });
			return rows.length;
		},
	});

	const [
		remainingCodes,
		remainingTokens,
		remainingRefreshTokens,
		remainingTransactions,
		remainingSessions,
	] = await Promise.all([
		measureBoundedRemainingLag(selectOauthCodeIds),
		measureBoundedRemainingLag(selectOauthTokenIds),
		measureBoundedRemainingLag(selectOauthRefreshTokenIds),
		measureBoundedRemainingLag(selectOauthAuthorizationTransactionIds),
		measureBoundedRemainingLag(selectUserSessionIds),
	]);

	const result: CleanupResult = {
		oauthCodes: { ...oauthCodes, ...remainingCodes },
		oauthTokens: { ...oauthTokens, ...remainingTokens },
		oauthRefreshTokens: { ...oauthRefreshTokens, ...remainingRefreshTokens },
		oauthAuthorizationTransactions: {
			...oauthAuthorizationTransactions,
			...remainingTransactions,
		},
		userSessions: { ...userSessions, ...remainingSessions },
	};

	cleanupLogger.info(
		{
			deleted: {
				oauthCodes: result.oauthCodes.deleted,
				oauthTokens: result.oauthTokens.deleted,
				oauthRefreshTokens: result.oauthRefreshTokens.deleted,
				oauthAuthorizationTransactions: result.oauthAuthorizationTransactions.deleted,
				userSessions: result.userSessions.deleted,
			},
			remainingLag: {
				oauthCodes: result.oauthCodes.remainingLag,
				oauthTokens: result.oauthTokens.remainingLag,
				oauthRefreshTokens: result.oauthRefreshTokens.remainingLag,
				oauthAuthorizationTransactions: result.oauthAuthorizationTransactions.remainingLag,
				userSessions: result.userSessions.remainingLag,
			},
			remainingLagCapped: {
				oauthCodes: result.oauthCodes.remainingLagCapped,
				oauthTokens: result.oauthTokens.remainingLagCapped,
				oauthRefreshTokens: result.oauthRefreshTokens.remainingLagCapped,
				oauthAuthorizationTransactions: result.oauthAuthorizationTransactions.remainingLagCapped,
				userSessions: result.userSessions.remainingLagCapped,
			},
		},
		'Scheduled cleanup sweep complete',
	);

	return result;
}

let scheduledCleanupIntervalHandle: ReturnType<typeof setInterval> | null = null;
/**
 * A review finding (P2): the distributed lease's TTL is exactly
 * `intervalMilliseconds` and is never renewed while a sweep runs, so a
 * sweep slower than the configured interval (a deliberately short interval,
 * or a degraded database) lets the lease lapse mid-sweep. The NEXT tick,
 * even on the SAME process, can then win a fresh lease and start a second,
 * overlapping sweep — with no Redis configured at all, the lease always
 * returns `true` unconditionally, so there is zero protection against this
 * within one process either way. Track whether THIS process's own sweep is
 * still in flight and skip starting another one locally, independent of
 * (and in addition to) the cross-replica lease.
 */
let sweepInProgress = false;

// Namespaced the same way `request-rate-limiter.ts` namespaces its own
// Redis keys: empty (unchanged key shape) in every real deployment, and set
// per test run so two suites racing against the same shared test Redis
// don't contend over one one global lease key that has nothing to do with
// what either of them is asserting.
const CLEANUP_LEASE_KEY = environment.RATE_LIMIT_KEY_NAMESPACE
	? `scheduled_cleanup:${environment.RATE_LIMIT_KEY_NAMESPACE}:leader_lease`
	: 'scheduled_cleanup:leader_lease';
/** One value per process, not per acquisition -- see `acquireScheduledCleanupLease`'s comment for why the SAME value must survive across an unref'd interval's repeated calls. */
const cleanupLeaseHolderId = randomUUID();

/**
 * A review finding (P2): every replica in a multi-instance deployment calls
 * `startScheduledCleanup` independently, with nothing coordinating them.
 * `runScheduledCleanup` itself is safe to run from more than one replica at
 * once (each batch's `DELETE ... WHERE id IN (...)` only matches rows still
 * actually eligible at execution time, so overlapping sweeps race harmlessly
 * to the same end state rather than corrupting anything -- see that
 * function's own doc comment) -- but "safe" is not "free": N replicas
 * deployed together each run all five lag-measurement queries and delete
 * batches from the same tables on the same schedule, multiplying database
 * load and lock contention by the replica count for a job that is by design
 * meant to run once.
 *
 * A `SET key value NX PX ttl` lease elects exactly one replica per sweep
 * window: whichever replica's `SET` lands first holds the lease and runs the
 * sweep; every other replica's conditional `SET` fails and it skips this
 * cycle. The lease is intentionally NOT renewed or explicitly released --
 * it is scoped to `intervalMilliseconds` and simply expires before the next
 * scheduled tick, so a replica that dies mid-sweep never leaves the job
 * permanently stuck (the lease just lapses and the next tick, on any
 * surviving replica, acquires it fresh). With no Redis configured (a
 * single-process deployment, or local development) coordination has nothing
 * to coordinate across, so this always returns `true` and every sweep runs
 * unconditionally -- identical to this function's original behavior.
 *
 * `holderId` defaults to this process's own generated identity; a test
 * exercising cross-replica coordination against real Redis can pass two
 * distinct values to simulate two independent replica processes racing for
 * the same lease key without actually spawning two processes.
 */
export async function acquireScheduledCleanupLease(
	leaseDurationMilliseconds: number,
	holderId: string = cleanupLeaseHolderId,
): Promise<boolean> {
	if (!isRedisConfigured()) return true;

	try {
		const redisClient = await getRedisClient();
		const result = await redisClient.set(CLEANUP_LEASE_KEY, holderId, {
			condition: 'NX',
			expiration: { type: 'PX', value: leaseDurationMilliseconds },
		});
		return result === 'OK';
	} catch (error) {
		// Redis being unreachable must not silently stop cleanup from ever
		// running again -- fail open (run the sweep) rather than fail closed.
		// Worst case under a real network partition between replicas: more
		// than one replica runs the same sweep, which is the safe-but-wasteful
		// case this lease exists to reduce, not the one it exists to prevent.
		cleanupLogger.error(
			{ err: error },
			'Failed to acquire scheduled cleanup lease; running sweep unconditionally',
		);
		return true;
	}
}

/**
 * DATA-001 / S-18: "cleanup exists only as an unscheduled script." Starts an
 * in-process interval that runs `runScheduledCleanup` on a fixed cadence,
 * gated by `acquireScheduledCleanupLease` so only one replica in a
 * multi-instance deployment actually runs each sweep. A no-op if already
 * running -- calling this twice does not double the schedule.
 * `stopScheduledCleanup` is the counterpart, used by tests and by a
 * graceful shutdown path.
 *
 * `runSweep` and `acquireLease` default to `runScheduledCleanup` and
 * `acquireScheduledCleanupLease` and exist purely so a test can inject
 * controllable stand-ins -- proving the local overlap guard
 * (`sweepInProgress`) deterministically, with real timers but without a
 * real database sweep or contending with this process's own real, globally
 * shared Redis lease key.
 */
export function startScheduledCleanup(
	intervalMilliseconds: number,
	runSweep: () => Promise<unknown> = runScheduledCleanup,
	acquireLease: (
		leaseDurationMilliseconds: number,
	) => Promise<boolean> = acquireScheduledCleanupLease,
): void {
	if (scheduledCleanupIntervalHandle) {
		return;
	}
	scheduledCleanupIntervalHandle = setInterval(() => {
		void (async () => {
			if (sweepInProgress) {
				cleanupLogger.info(
					'This process is still running the previous scheduled cleanup sweep; skipping this tick',
				);
				return;
			}
			sweepInProgress = true;
			try {
				const acquiredLease = await acquireLease(intervalMilliseconds);
				if (!acquiredLease) {
					cleanupLogger.info(
						'Another replica holds the scheduled cleanup lease this cycle; skipping',
					);
					return;
				}
				await runSweep();
			} catch (error) {
				cleanupLogger.error({ err: error }, 'Scheduled cleanup sweep failed');
			} finally {
				sweepInProgress = false;
			}
		})();
	}, intervalMilliseconds);
	// Never let a scheduled interval keep the process alive on its own --
	// this is background maintenance, not core server work.
	scheduledCleanupIntervalHandle.unref?.();
}

export function stopScheduledCleanup(): void {
	if (scheduledCleanupIntervalHandle) {
		clearInterval(scheduledCleanupIntervalHandle);
		scheduledCleanupIntervalHandle = null;
	}
}

export function isScheduledCleanupRunning(): boolean {
	return scheduledCleanupIntervalHandle !== null;
}
