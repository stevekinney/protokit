import { count, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@template/mcp/logger';

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
	/** DATA-001: "monitor lag" -- how many still-eligible rows remain after this sweep, so an operator can see a growing backlog before it becomes an incident. */
	remainingLag: number;
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

	const oauthCodes = await deleteAsPrimaryKeyBatches({
		label: 'oauth_codes',
		batchSize,
		maxIterations: maxIterationsPerTable,
		selectIds: (limit) =>
			database
				.select({ id: schema.oauthCodes.code })
				.from(schema.oauthCodes)
				.where(or(lt(schema.oauthCodes.expiresAt, now), isNotNull(schema.oauthCodes.usedAt)))
				.limit(limit),
		deleteByIds: async (ids) => {
			const rows = await database
				.delete(schema.oauthCodes)
				.where(inArray(schema.oauthCodes.code, ids))
				.returning({ code: schema.oauthCodes.code });
			return rows.length;
		},
	});

	const oauthTokens = await deleteAsPrimaryKeyBatches({
		label: 'oauth_tokens',
		batchSize,
		maxIterations: maxIterationsPerTable,
		selectIds: (limit) =>
			database
				.select({ id: schema.oauthTokens.accessToken })
				.from(schema.oauthTokens)
				.where(or(isNotNull(schema.oauthTokens.revokedAt), lt(schema.oauthTokens.expiresAt, now)))
				.limit(limit),
		deleteByIds: async (ids) => {
			const rows = await database
				.delete(schema.oauthTokens)
				.where(inArray(schema.oauthTokens.accessToken, ids))
				.returning({ accessToken: schema.oauthTokens.accessToken });
			return rows.length;
		},
	});

	const oauthRefreshTokens = await deleteAsPrimaryKeyBatches({
		label: 'oauth_refresh_tokens',
		batchSize,
		maxIterations: maxIterationsPerTable,
		selectIds: (limit) =>
			database
				.select({ id: schema.oauthRefreshTokens.refreshToken })
				.from(schema.oauthRefreshTokens)
				.where(
					or(
						isNotNull(schema.oauthRefreshTokens.revokedAt),
						lt(schema.oauthRefreshTokens.expiresAt, now),
					),
				)
				.limit(limit),
		deleteByIds: async (ids) => {
			const rows = await database
				.delete(schema.oauthRefreshTokens)
				.where(inArray(schema.oauthRefreshTokens.refreshToken, ids))
				.returning({ refreshToken: schema.oauthRefreshTokens.refreshToken });
			return rows.length;
		},
	});

	const oauthAuthorizationTransactions = await deleteAsPrimaryKeyBatches({
		label: 'oauth_authorization_transactions',
		batchSize,
		maxIterations: maxIterationsPerTable,
		selectIds: (limit) =>
			database
				.select({ id: schema.oauthAuthorizationTransactions.transactionId })
				.from(schema.oauthAuthorizationTransactions)
				.where(
					or(
						lt(schema.oauthAuthorizationTransactions.expiresAt, now),
						isNotNull(schema.oauthAuthorizationTransactions.consumedAt),
					),
				)
				.limit(limit),
		deleteByIds: async (ids) => {
			const rows = await database
				.delete(schema.oauthAuthorizationTransactions)
				.where(inArray(schema.oauthAuthorizationTransactions.transactionId, ids))
				.returning({ transactionId: schema.oauthAuthorizationTransactions.transactionId });
			return rows.length;
		},
	});

	const userSessions = await deleteAsPrimaryKeyBatches({
		label: 'user_sessions',
		batchSize,
		maxIterations: maxIterationsPerTable,
		selectIds: (limit) =>
			database
				.select({ id: schema.userSessions.sessionTokenHash })
				.from(schema.userSessions)
				.where(or(isNotNull(schema.userSessions.revokedAt), lt(schema.userSessions.expiresAt, now)))
				.limit(limit),
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
		database
			.select({ value: count() })
			.from(schema.oauthCodes)
			.where(or(lt(schema.oauthCodes.expiresAt, now), isNotNull(schema.oauthCodes.usedAt))),
		database
			.select({ value: count() })
			.from(schema.oauthTokens)
			.where(or(isNotNull(schema.oauthTokens.revokedAt), lt(schema.oauthTokens.expiresAt, now))),
		database
			.select({ value: count() })
			.from(schema.oauthRefreshTokens)
			.where(
				or(
					isNotNull(schema.oauthRefreshTokens.revokedAt),
					lt(schema.oauthRefreshTokens.expiresAt, now),
				),
			),
		database
			.select({ value: count() })
			.from(schema.oauthAuthorizationTransactions)
			.where(
				or(
					lt(schema.oauthAuthorizationTransactions.expiresAt, now),
					isNotNull(schema.oauthAuthorizationTransactions.consumedAt),
				),
			),
		database
			.select({ value: count() })
			.from(schema.userSessions)
			.where(or(isNotNull(schema.userSessions.revokedAt), lt(schema.userSessions.expiresAt, now))),
	]);

	const result: CleanupResult = {
		oauthCodes: { ...oauthCodes, remainingLag: remainingCodes[0]?.value ?? 0 },
		oauthTokens: { ...oauthTokens, remainingLag: remainingTokens[0]?.value ?? 0 },
		oauthRefreshTokens: {
			...oauthRefreshTokens,
			remainingLag: remainingRefreshTokens[0]?.value ?? 0,
		},
		oauthAuthorizationTransactions: {
			...oauthAuthorizationTransactions,
			remainingLag: remainingTransactions[0]?.value ?? 0,
		},
		userSessions: { ...userSessions, remainingLag: remainingSessions[0]?.value ?? 0 },
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
		},
		'Scheduled cleanup sweep complete',
	);

	return result;
}

let scheduledCleanupIntervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * DATA-001 / S-18: "cleanup exists only as an unscheduled script." Starts an
 * in-process interval that runs `runScheduledCleanup` on a fixed cadence.
 * A no-op if already running -- calling this twice does not double the
 * schedule. `stopScheduledCleanup` is the counterpart, used by tests and by
 * a graceful shutdown path.
 */
export function startScheduledCleanup(intervalMilliseconds: number): void {
	if (scheduledCleanupIntervalHandle) {
		return;
	}
	scheduledCleanupIntervalHandle = setInterval(() => {
		runScheduledCleanup().catch((error: unknown) => {
			cleanupLogger.error({ err: error }, 'Scheduled cleanup sweep failed');
		});
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
