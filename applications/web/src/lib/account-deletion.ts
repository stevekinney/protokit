import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@template/mcp/logger';

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

/**
 * DATA-001 / S-18 acceptance criterion 4: "Account and client deletion
 * tests leave no usable session, code, token, subscription, or orphaned
 * service identity."
 *
 * Deletes every row this user's account owns, child-first, then the user
 * row itself. `packages/database/src/schema.ts`'s `onDelete: 'cascade'`
 * foreign keys (migration 0006, generated but not yet applied at the time
 * this module was written — see `.roadmap-progress/DATA-001.md`) are
 * defense-in-depth for this same guarantee at the database layer; this
 * function does not depend on them, because `neon-http` has no transaction
 * support (`db.transaction()` throws `"No transactions support in
 * neon-http driver"`, confirmed directly against the installed driver by
 * `OAUTH-003` — see its progress notes). Atomicity here comes from strict
 * child-first ordering, the same pattern `OAUTH-003` established for
 * refresh-token rotation: every statement's own `WHERE` predicate is
 * self-contained, so a failure partway through this sequence leaves only
 * inert orphans (rows one link short of a user row that no longer exists,
 * already unusable at the moment their own child rows were removed) —
 * never a live, usable credential outliving its account.
 *
 * Client registrations (`oauth_clients`) are deliberately untouched here:
 * a client is not owned by any one user in this schema (multiple users can
 * authorize the same client), so deleting a user's account must not delete
 * client registrations other users still rely on. `deleteOauthClient`
 * below is the separate, client-scoped counterpart.
 */
export async function deleteUserAccount(userId: string): Promise<AccountDeletionResult> {
	const deletedAccessTokens = await database
		.delete(schema.oauthTokens)
		.where(eq(schema.oauthTokens.userId, userId))
		.returning({ accessToken: schema.oauthTokens.accessToken });

	const deletedRefreshTokens = await database
		.delete(schema.oauthRefreshTokens)
		.where(eq(schema.oauthRefreshTokens.userId, userId))
		.returning({ refreshToken: schema.oauthRefreshTokens.refreshToken });

	const deletedCodes = await database
		.delete(schema.oauthCodes)
		.where(eq(schema.oauthCodes.userId, userId))
		.returning({ code: schema.oauthCodes.code });

	const deletedTransactions = await database
		.delete(schema.oauthAuthorizationTransactions)
		.where(eq(schema.oauthAuthorizationTransactions.userId, userId))
		.returning({ transactionId: schema.oauthAuthorizationTransactions.transactionId });

	const deletedSessions = await database
		.delete(schema.userSessions)
		.where(eq(schema.userSessions.userId, userId))
		.returning({ sessionTokenHash: schema.userSessions.sessionTokenHash });

	const deletedGoogleAccounts = await database
		.delete(schema.userGoogleAccounts)
		.where(eq(schema.userGoogleAccounts.userId, userId))
		.returning({ googleSubject: schema.userGoogleAccounts.googleSubject });

	const deletedUsers = await database
		.delete(schema.users)
		.where(eq(schema.users.id, userId))
		.returning({ id: schema.users.id });

	const result: AccountDeletionResult = {
		deletedAccessTokens: deletedAccessTokens.length,
		deletedRefreshTokens: deletedRefreshTokens.length,
		deletedCodes: deletedCodes.length,
		deletedTransactions: deletedTransactions.length,
		deletedSessions: deletedSessions.length,
		deletedGoogleAccounts: deletedGoogleAccounts.length,
		deletedUser: deletedUsers.length > 0,
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
};

/**
 * DATA-001 / S-18: the client-scoped counterpart to `deleteUserAccount`.
 * No self-service HTTP route exposes this in this template (RFC 7592
 * Dynamic Client Registration Management is out of this roadmap item's
 * scope), but the acceptance criterion's "client deletion" half needs a
 * real, tested implementation an operator can call, not only a schema-level
 * cascade — see this module's top-level doc comment for why `onDelete:
 * 'cascade'` alone is not this function's atomicity story either.
 */
export async function deleteOauthClient(clientId: string): Promise<ClientDeletionResult> {
	const deletedAccessTokens = await database
		.delete(schema.oauthTokens)
		.where(eq(schema.oauthTokens.clientId, clientId))
		.returning({ accessToken: schema.oauthTokens.accessToken });

	const deletedRefreshTokens = await database
		.delete(schema.oauthRefreshTokens)
		.where(eq(schema.oauthRefreshTokens.clientId, clientId))
		.returning({ refreshToken: schema.oauthRefreshTokens.refreshToken });

	const deletedCodes = await database
		.delete(schema.oauthCodes)
		.where(eq(schema.oauthCodes.clientId, clientId))
		.returning({ code: schema.oauthCodes.code });

	const deletedTransactions = await database
		.delete(schema.oauthAuthorizationTransactions)
		.where(eq(schema.oauthAuthorizationTransactions.clientId, clientId))
		.returning({ transactionId: schema.oauthAuthorizationTransactions.transactionId });

	const deletedClients = await database
		.delete(schema.oauthClients)
		.where(eq(schema.oauthClients.clientId, clientId))
		.returning({ clientId: schema.oauthClients.clientId });

	const result: ClientDeletionResult = {
		deletedAccessTokens: deletedAccessTokens.length,
		deletedRefreshTokens: deletedRefreshTokens.length,
		deletedCodes: deletedCodes.length,
		deletedTransactions: deletedTransactions.length,
		deletedClient: deletedClients.length > 0,
	};

	deletionLogger.info(
		{ clientId, ...result },
		'Deleted OAuth client and every dependent credential',
	);
	return result;
}
