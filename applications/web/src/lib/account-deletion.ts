import { sql } from 'drizzle-orm';
import { database } from '@template/database';
import { logger } from '@lostgradient/mcp/logger';

const deletionLogger = logger.child({ module: 'account-deletion' });

export type AccountDeletionResult = {
	deletedAccessTokens: number;
	deletedRefreshTokens: number;
	deletedCodes: number;
	deletedTransactions: number;
	deletedSessions: number;
	deletedGoogleAccounts: number;
	deletedUser: boolean;
};

type AccountDeletionRow = {
	deleted_access_tokens: string;
	deleted_refresh_tokens: string;
	deleted_codes: string;
	deleted_transactions: string;
	deleted_sessions: string;
	deleted_google_accounts: string;
	deleted_user: string;
};

/**
 * DATA-001 / S-18 acceptance criterion 4: "Account and client deletion
 * tests leave no usable session, code, token, subscription, or orphaned
 * service identity."
 *
 * Review round 6 (P2): the previous implementation issued one `DELETE`
 * statement per table, child-first, then the user row last. `neon-http` has
 * no multi-statement transaction support (confirmed directly against the
 * installed driver by `OAUTH-003` — see its progress notes), so a transient
 * failure partway through that sequence could stop before the user row (or
 * even before every child row) was removed, leaving a live, usable
 * credential — a session, an access token, a refresh token — outliving an
 * account whose deletion the caller believes already happened.
 *
 * `packages/database/src/schema.ts`'s `onDelete: 'cascade'` foreign keys
 * from every child table to `users` make a single `DELETE FROM users`
 * genuinely atomic (one Postgres statement, all-or-nothing, exactly this
 * codebase's established atomicity unit — the same one `OAUTH-003` and
 * the OAuth TransactionStore adapter relies on). But deleting only the user row
 * and trusting the cascade loses the per-table counts `AccountDeletionResult`
 * reports, which the audit log this function feeds depends on — a plain
 * `DELETE FROM users ... RETURNING id` cannot see what the cascade removed
 * in other tables.
 *
 * This statement gets both: one `WITH` block whose six child `DELETE`s each
 * still target their own table with their own `RETURNING`, so their counts
 * are exact, self-observed deletions — not inferred from the cascade. The
 * final `deleted_user` CTE's `WHERE` clause references
 * `child_deletion_barrier`, which in turn selects from all six child CTEs;
 * Postgres must fully evaluate a data-modifying CTE before a query that
 * reads its `RETURNING` output can run, so this forces the six child
 * deletes to complete before the user row is deleted — not merely "usually
 * runs first", which is all the previous per-statement version, or an
 * un-forced multi-CTE statement with no such dependency, would have
 * guaranteed. By the time the user row's own cascade trigger fires, every
 * child row this statement is responsible for reporting is already gone,
 * so the cascade finds nothing left to remove — a harmless no-op that never
 * competes with this statement's own counts. The whole thing is one
 * Postgres statement, so it is atomic without a `neon-http` transaction:
 * every DELETE either all happen or none do.
 *
 * Client registrations (`oauth_clients`) are deliberately untouched here:
 * a client is not owned by any one user in this schema (multiple users can
 * authorize the same client), so deleting a user's account must not delete
 * client registrations other users still rely on. `deleteOauthClient`
 * below is the separate, client-scoped counterpart.
 */
export async function deleteUserAccount(userId: string): Promise<AccountDeletionResult> {
	const { rows } = await database.execute<AccountDeletionRow>(sql`
		WITH
			deleted_access_tokens AS (
				DELETE FROM oauth_tokens WHERE user_id = ${userId} RETURNING access_token
			),
			deleted_refresh_tokens AS (
				DELETE FROM oauth_refresh_tokens WHERE user_id = ${userId} RETURNING refresh_token
			),
			deleted_codes AS (
				DELETE FROM oauth_codes WHERE user_id = ${userId} RETURNING code
			),
			deleted_transactions AS (
				DELETE FROM oauth_authorization_transactions WHERE user_id = ${userId} RETURNING transaction_id
			),
			deleted_sessions AS (
				DELETE FROM user_sessions WHERE user_id = ${userId} RETURNING session_token_hash
			),
			deleted_google_accounts AS (
				DELETE FROM user_google_accounts WHERE user_id = ${userId} RETURNING google_subject
			),
			child_deletion_barrier AS (
				SELECT
					(SELECT count(*) FROM deleted_access_tokens) AS access_tokens,
					(SELECT count(*) FROM deleted_refresh_tokens) AS refresh_tokens,
					(SELECT count(*) FROM deleted_codes) AS codes,
					(SELECT count(*) FROM deleted_transactions) AS transactions,
					(SELECT count(*) FROM deleted_sessions) AS sessions,
					(SELECT count(*) FROM deleted_google_accounts) AS google_accounts
			),
			deleted_user AS (
				DELETE FROM users
				WHERE id = ${userId} AND (SELECT true FROM child_deletion_barrier)
				RETURNING id
			)
		SELECT
			(SELECT access_tokens FROM child_deletion_barrier)::text AS deleted_access_tokens,
			(SELECT refresh_tokens FROM child_deletion_barrier)::text AS deleted_refresh_tokens,
			(SELECT codes FROM child_deletion_barrier)::text AS deleted_codes,
			(SELECT transactions FROM child_deletion_barrier)::text AS deleted_transactions,
			(SELECT sessions FROM child_deletion_barrier)::text AS deleted_sessions,
			(SELECT google_accounts FROM child_deletion_barrier)::text AS deleted_google_accounts,
			(SELECT count(*) FROM deleted_user)::text AS deleted_user
	`);

	const row = rows[0];
	const result: AccountDeletionResult = {
		deletedAccessTokens: Number(row?.deleted_access_tokens ?? '0'),
		deletedRefreshTokens: Number(row?.deleted_refresh_tokens ?? '0'),
		deletedCodes: Number(row?.deleted_codes ?? '0'),
		deletedTransactions: Number(row?.deleted_transactions ?? '0'),
		deletedSessions: Number(row?.deleted_sessions ?? '0'),
		deletedGoogleAccounts: Number(row?.deleted_google_accounts ?? '0'),
		deletedUser: Number(row?.deleted_user ?? '0') > 0,
	};

	deletionLogger.info({ userId, ...result }, 'Deleted user account and every dependent credential');
	return result;
}

export type ClientDeletionResult = {
	deletedAccessTokens: number;
	deletedRefreshTokens: number;
	deletedCodes: number;
	deletedTransactions: number;
	deletedClient: boolean;
	/**
	 * Round 10 review finding: `true` when the deleted row's
	 * `client_id_metadata_url` was set -- i.e. the client is a Client ID
	 * Metadata Document client, not a DCR (`randomUUID()`) one. Deleting a
	 * CIMD-backed row is NOT a durable revocation the way it is for a DCR
	 * client: `handleOauthAuthorizeGet` re-fetches and re-upserts a CIMD
	 * client's row on EVERY authorization request that names its document
	 * URL, deliberately (`OAUTH-002`), so a client's own `redirect_uris`
	 * update takes effect. The very next `/oauth/authorize` request naming
	 * the same URL silently re-registers this "deleted" client. This call
	 * still revokes every currently valid credential immediately (the
	 * counts above are real and unaffected) -- only the "this client can
	 * never authorize again" guarantee does not durably hold for a CIMD
	 * client without also denying the document at its own hosting/network
	 * layer, which this application has no way to do. A caller must not
	 * treat `deletedClient: true` alone as proof a CIMD client is gone for
	 * good; check this field too.
	 */
	cimdClientMayReauthorize: boolean;
};

type ClientDeletionRow = {
	deleted_access_tokens: string;
	deleted_refresh_tokens: string;
	deleted_codes: string;
	deleted_transactions: string;
	deleted_client: string;
	deleted_client_metadata_url: string | null;
};

/**
 * DATA-001 / S-18: the client-scoped counterpart to `deleteUserAccount`.
 * No self-service HTTP route exposes this in this template (RFC 7592
 * Dynamic Client Registration Management is out of this roadmap item's
 * scope), but the acceptance criterion's "client deletion" half needs a
 * real, tested implementation an operator can call. Same single-statement,
 * dependency-forced-ordering construction as `deleteUserAccount` above, and
 * for the same reason — see that function's doc comment for the full
 * argument.
 */
export async function deleteOauthClient(clientId: string): Promise<ClientDeletionResult> {
	const { rows } = await database.execute<ClientDeletionRow>(sql`
		WITH
			deleted_access_tokens AS (
				DELETE FROM oauth_tokens WHERE client_id = ${clientId} RETURNING access_token
			),
			deleted_refresh_tokens AS (
				DELETE FROM oauth_refresh_tokens WHERE client_id = ${clientId} RETURNING refresh_token
			),
			deleted_codes AS (
				DELETE FROM oauth_codes WHERE client_id = ${clientId} RETURNING code
			),
			deleted_transactions AS (
				DELETE FROM oauth_authorization_transactions WHERE client_id = ${clientId} RETURNING transaction_id
			),
			child_deletion_barrier AS (
				SELECT
					(SELECT count(*) FROM deleted_access_tokens) AS access_tokens,
					(SELECT count(*) FROM deleted_refresh_tokens) AS refresh_tokens,
					(SELECT count(*) FROM deleted_codes) AS codes,
					(SELECT count(*) FROM deleted_transactions) AS transactions
			),
			deleted_client AS (
				DELETE FROM oauth_clients
				WHERE client_id = ${clientId} AND (SELECT true FROM child_deletion_barrier)
				RETURNING client_id, client_id_metadata_url
			)
		SELECT
			(SELECT access_tokens FROM child_deletion_barrier)::text AS deleted_access_tokens,
			(SELECT refresh_tokens FROM child_deletion_barrier)::text AS deleted_refresh_tokens,
			(SELECT codes FROM child_deletion_barrier)::text AS deleted_codes,
			(SELECT transactions FROM child_deletion_barrier)::text AS deleted_transactions,
			(SELECT count(*) FROM deleted_client)::text AS deleted_client,
			(SELECT client_id_metadata_url FROM deleted_client LIMIT 1) AS deleted_client_metadata_url
	`);

	const row = rows[0];
	const cimdClientMayReauthorize = Boolean(row?.deleted_client_metadata_url);
	const result: ClientDeletionResult = {
		deletedAccessTokens: Number(row?.deleted_access_tokens ?? '0'),
		deletedRefreshTokens: Number(row?.deleted_refresh_tokens ?? '0'),
		deletedCodes: Number(row?.deleted_codes ?? '0'),
		deletedTransactions: Number(row?.deleted_transactions ?? '0'),
		deletedClient: Number(row?.deleted_client ?? '0') > 0,
		cimdClientMayReauthorize,
	};

	deletionLogger.info(
		{ clientId, ...result },
		'Deleted OAuth client and every dependent credential',
	);
	if (cimdClientMayReauthorize) {
		// Round 10 review finding: explicit, not silent. An operator relying
		// on `deletedClient: true` alone would believe this client can never
		// authorize again -- false for a CIMD-backed client, whose row is
		// re-created by the very next `/oauth/authorize` request naming the
		// same document URL. See `ClientDeletionResult.cimdClientMayReauthorize`'s
		// doc comment for the full explanation and why a durable tombstone
		// is not implemented here (it would require a schema migration).
		deletionLogger.warn(
			{ clientId, event: 'oauth_client_deletion', outcome: 'cimd_client_not_durably_revoked' },
			'Deleted a CIMD-backed OAuth client and every currently valid credential for it, but this is not a durable revocation: the client can silently re-register itself the next time /oauth/authorize names the same Client ID Metadata Document URL. Durably blocking it requires denying that document at its own hosting/network layer.',
		);
	}
	return result;
}
