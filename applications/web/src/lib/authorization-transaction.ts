import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';

/**
 * A short-lived, single-use, server-side record of one browser
 * authorization consent screen (SEC-005 / S-09). `handleOauthAuthorizeGet`
 * creates one after validating the client, redirect URI, and PKCE
 * challenge; the consent page's approve/deny forms carry only the opaque
 * `transactionId` and a one-time `csrfToken` returned here. Every
 * authoritative value is reloaded from the stored row when the form is
 * submitted — editing a hidden form field cannot change the client,
 * redirect URI, scopes, PKCE challenge, or state that was actually
 * reviewed.
 */
const authorizationTransactionTimeToLiveMs = 10 * 60 * 1000;

export type AuthorizationTransactionInput = {
	userId: string;
	sessionToken: string;
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	codeChallengeMethod: string;
	state: string | null;
	issuer: string;
	/** OAUTH-001 / RFC 8707: the canonical MCP resource URL this authorization was requested for, already validated by the caller. */
	resource: string;
};

export type CreatedAuthorizationTransaction = {
	transactionId: string;
	csrfToken: string;
};

export async function createAuthorizationTransaction(
	input: AuthorizationTransactionInput,
): Promise<CreatedAuthorizationTransaction> {
	const transactionId = randomBytes(32).toString('hex');
	const csrfToken = randomBytes(32).toString('hex');

	await database.insert(schema.oauthAuthorizationTransactions).values({
		transactionId: hashCredential(transactionId),
		csrfTokenHash: hashCredential(csrfToken),
		userId: input.userId,
		sessionTokenHash: hashCredential(input.sessionToken),
		clientId: input.clientId,
		redirectUri: input.redirectUri,
		codeChallenge: input.codeChallenge,
		codeChallengeMethod: input.codeChallengeMethod,
		state: input.state,
		issuer: input.issuer,
		resource: input.resource,
		expiresAt: new Date(Date.now() + authorizationTransactionTimeToLiveMs),
	});

	return { transactionId, csrfToken };
}

export type ConsumedAuthorizationTransaction = {
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	codeChallengeMethod: string;
	state: string | null;
	issuer: string;
	resource: string;
};

/**
 * Atomically consumes a transaction in one `UPDATE ... WHERE ... RETURNING`
 * statement. Every rejection reason the roadmap names — missing,
 * mismatched CSRF value, expired, already-consumed (replayed),
 * cross-session, or cross-user — collapses into the same `WHERE` clause,
 * so there is no window between "check" and "consume" for a second request
 * to race, and a transaction that fails any single condition returns
 * `null` with the row left exactly as it was (still consumable only by
 * nothing, since it's already invalid for the reason that tripped).
 */
export async function consumeAuthorizationTransaction(input: {
	transactionId: string;
	csrfToken: string;
	userId: string;
	sessionToken: string;
}): Promise<ConsumedAuthorizationTransaction | null> {
	const [consumed] = await database
		.update(schema.oauthAuthorizationTransactions)
		.set({ consumedAt: new Date() })
		.where(
			and(
				eq(
					schema.oauthAuthorizationTransactions.transactionId,
					hashCredential(input.transactionId),
				),
				eq(schema.oauthAuthorizationTransactions.csrfTokenHash, hashCredential(input.csrfToken)),
				eq(schema.oauthAuthorizationTransactions.userId, input.userId),
				eq(
					schema.oauthAuthorizationTransactions.sessionTokenHash,
					hashCredential(input.sessionToken),
				),
				isNull(schema.oauthAuthorizationTransactions.consumedAt),
				gt(schema.oauthAuthorizationTransactions.expiresAt, new Date()),
			),
		)
		.returning();

	if (!consumed) {
		return null;
	}

	return {
		clientId: consumed.clientId,
		redirectUri: consumed.redirectUri,
		codeChallenge: consumed.codeChallenge,
		codeChallengeMethod: consumed.codeChallengeMethod,
		state: consumed.state,
		issuer: consumed.issuer,
		resource: consumed.resource,
	};
}
