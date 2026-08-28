import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@lostgradient/mcp/logger';
import { isValidClientName } from '@web/lib/client-name-validation';
import { publishGrantRevocation } from '@web/lib/mcp-grant-revocation-channel';

const consentLogger = logger.child({ module: 'consent-inventory' });

export type ConnectionSummary = {
	clientId: string;
	clientName: string;
	/** The most restrictive (earliest) `expiresAt` across this client's live access/refresh tokens for this user — when the grant is next due to lapse on its own if never revoked. */
	earliestExpiresAt: Date;
};

/**
 * DATA-001 / S-18: "Add a user-facing connector and consent inventory with
 * revoke-all and per-client revocation." One row per OAuth client that
 * currently holds at least one live (not revoked, not expired) access or
 * refresh token issued to this user — the set a user would recognize as
 * "apps I've connected", not every client that has ever requested access.
 */
export async function listUserConnections(userId: string): Promise<ConnectionSummary[]> {
	const now = new Date();

	const liveAccessTokens = await database
		.select({
			clientId: schema.oauthTokens.clientId,
			clientName: schema.oauthClients.clientName,
			expiresAt: schema.oauthTokens.expiresAt,
		})
		.from(schema.oauthTokens)
		.innerJoin(schema.oauthClients, eq(schema.oauthTokens.clientId, schema.oauthClients.clientId))
		.where(
			and(
				eq(schema.oauthTokens.userId, userId),
				isNull(schema.oauthTokens.revokedAt),
				gt(schema.oauthTokens.expiresAt, now),
			),
		);

	const liveRefreshTokens = await database
		.select({
			clientId: schema.oauthRefreshTokens.clientId,
			clientName: schema.oauthClients.clientName,
			expiresAt: schema.oauthRefreshTokens.expiresAt,
		})
		.from(schema.oauthRefreshTokens)
		.innerJoin(
			schema.oauthClients,
			eq(schema.oauthRefreshTokens.clientId, schema.oauthClients.clientId),
		)
		.where(
			and(
				eq(schema.oauthRefreshTokens.userId, userId),
				isNull(schema.oauthRefreshTokens.revokedAt),
				gt(schema.oauthRefreshTokens.expiresAt, now),
			),
		);

	// Review finding (P2): a client registered before `isValidClientName`
	// existed (the previous registration schema accepted any nonempty
	// string) can still hold a stored name containing bidirectional-override,
	// control, or zero-width characters. `oauth-routes.ts`'s consent page
	// already substitutes a safe fallback for exactly this case; this is the
	// same defense-in-depth applied to the connected-applications inventory,
	// which otherwise copied the raw name next to that row's revoke button —
	// letting a legacy malicious client visually impersonate or conceal
	// another entry in a UI whose entire purpose is letting a user tell
	// their connections apart.
	const byClientId = new Map<string, ConnectionSummary>();
	for (const row of [...liveAccessTokens, ...liveRefreshTokens]) {
		const existing = byClientId.get(row.clientId);
		if (!existing || row.expiresAt < existing.earliestExpiresAt) {
			byClientId.set(row.clientId, {
				clientId: row.clientId,
				clientName: isValidClientName(row.clientName)
					? row.clientName
					: 'the requesting application',
				earliestExpiresAt: row.expiresAt,
			});
		}
	}

	return [...byClientId.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
}

export type RevocationResult = {
	revokedAccessTokens: number;
	revokedRefreshTokens: number;
	/**
	 * A review finding (P1): the original version of this function revoked
	 * only tokens that already existed. An authorization code issued just
	 * before the user clicked revoke is a single-use credential that has
	 * not yet been exchanged for a token pair — it has no `revokedAt`
	 * column for this function to have touched, and RFC 6749's 10-minute
	 * code lifetime (`credential-lifecycle-policy.ts`) is easily long
	 * enough for the registering client to redeem it AFTER the user was
	 * told the connection was revoked, minting a brand-new, entirely live
	 * access/refresh pair that this revocation never touched. Consuming
	 * (`usedAt`) every outstanding code for this grant closes that hole:
	 * `handleOauthTokenAuthorizationCodeGrant`'s exchange requires
	 * `isNull(usedAt)`, so a consumed-by-revocation code fails exchange
	 * exactly like an already-redeemed one.
	 *
	 * A later review finding (P2) widened this further: `usedAt` is now
	 * overwritten unconditionally for every not-yet-expired code, not only
	 * ones still unused, so this count includes codes an in-flight (or
	 * already-completed) token exchange had already marked used — see
	 * `revokeUserClientGrant`'s own comment for why overwriting rather than
	 * skipping is what closes the compensating-reopen race. This is a
	 * reporting-count change only; the exchange path was already rejecting
	 * an already-used code before this.
	 */
	consumedAuthorizationCodes: number;
};

type RevocationRow = {
	revoked_access_tokens: string;
	revoked_refresh_tokens: string;
	consumed_authorization_codes: string;
};

function revocationResultFromRow(row: RevocationRow | undefined): RevocationResult {
	return {
		revokedAccessTokens: Number(row?.revoked_access_tokens ?? '0'),
		revokedRefreshTokens: Number(row?.revoked_refresh_tokens ?? '0'),
		consumedAuthorizationCodes: Number(row?.consumed_authorization_codes ?? '0'),
	};
}

/**
 * Revokes every live access and refresh token this user has issued to one
 * client, and consumes every outstanding (not yet redeemed, not yet
 * expired) authorization code for that same user/client pair so it cannot
 * be exchanged afterward. "Revocation must terminate active MCP access, not
 * merely hide a record" (DATA-001) is satisfied structurally, not by
 * anything this function does specially: `/mcp` re-checks `revokedAt IS
 * NULL` against the database on every single request
 * (`routes/mcp-routes.ts`), so the moment this `UPDATE` commits, the very
 * next `/mcp` call with the revoked token 401s -- there is no cache or
 * session-affinity layer between this write and that check for a stale
 * value to survive in.
 *
 * Scope, stated precisely: this closes the authorization-code redemption
 * window, which is minutes wide and trivially reproducible. It does not
 * add a durable, table-level "this grant is revoked" flag consulted
 * atomically by every future token-issuing statement -- this schema has no
 * such table today (a client registration is not itself a "grant"; only
 * individual token/code ROWS carry revocation state), and adding one is an
 * architectural change beyond what this fix scopes to. The residual gap
 * that leaves open is a single in-flight refresh-token rotation that reads
 * its row as still live a database round trip before this function's own
 * `UPDATE` commits -- a race measured in milliseconds around one HTTP
 * request, not the minutes-wide code-redemption hole this fix closes.
 * Flagged here, not silently left unmentioned, for whoever next hardens
 * consent revocation with a real grant-level flag.
 *
 * Round 13 review (P2): the previous implementation issued these as three
 * separate `UPDATE` statements. `neon-http` has no multi-statement
 * transaction support (the same limitation `account-deletion.ts` documents
 * for `deleteUserAccount`/`deleteOauthClient`), so a transient failure
 * after the access-token `UPDATE` committed but before the refresh-token
 * `UPDATE` ran left the still-live refresh token able to immediately mint a
 * replacement access token — the exact live-access-outliving-revocation gap
 * this function exists to close. Folded into the same single `WITH`
 * (CTE) statement construction `account-deletion.ts` already established
 * for this driver: each mutation is still its own CTE with its own
 * `RETURNING`, so every count is a real, self-observed row count, and the
 * three `UPDATE`s are one Postgres statement, so they either all commit or
 * none do — no transaction API required.
 */
/**
 * Review finding (P2) on the `consumed_authorization_codes` CTE below: it
 * used to filter on `used_at IS NULL`, so a code
 * `handleOauthTokenAuthorizationCodeGrant` had already marked used (an
 * in-flight token exchange) was left completely untouched by revocation --
 * it simply matched no row. That silence is what let that handler's own
 * best-effort compensating reopen (on a failed token insert AFTER the code
 * was consumed) unconditionally clear `used_at` back to null, even when the
 * user had just revoked this exact grant in that same window --
 * resurrecting access the user was told was gone.
 *
 * Fix: revocation now OVERWRITES `used_at` unconditionally for every
 * not-yet-expired code, rather than skipping one that is already non-null.
 * That reopen's own `UPDATE` (see `oauth-routes.ts`) is conditioned on
 * `used_at` still holding the exact value it wrote when it consumed the
 * code -- once revocation overwrites it here, that condition no longer
 * matches and the reopen becomes a no-op, so the code stays dead instead of
 * being silently reopened. (The reverse ordering -- revocation running
 * before the exchange's own consume -- was already closed: that consume's
 * `used_at IS NULL` check fails once revocation has written a non-null
 * value first.) SQL `now()` and the handler's own `new Date()` essentially
 * never collide at millisecond precision, so this does not depend on
 * ordering two writes to the identical instant -- an actual collision would
 * just fall back to the prior (already-accepted) unconditional-reopen
 * behavior, not introduce a new failure mode. `expires_at > now()` keeps
 * this from rewriting `used_at` on long-dead historical codes that can
 * never be exchanged regardless.
 */
export async function revokeUserClientGrant(
	userId: string,
	clientId: string,
): Promise<RevocationResult> {
	const { rows } = await database.execute<RevocationRow>(sql`
		WITH
			revoked_access_tokens AS (
				UPDATE oauth_tokens
				SET revoked_at = now()
				WHERE user_id = ${userId} AND client_id = ${clientId} AND revoked_at IS NULL
				RETURNING access_token
			),
			revoked_refresh_tokens AS (
				UPDATE oauth_refresh_tokens
				SET revoked_at = now()
				WHERE user_id = ${userId} AND client_id = ${clientId} AND revoked_at IS NULL
				RETURNING refresh_token
			),
			consumed_authorization_codes AS (
				UPDATE oauth_codes
				SET used_at = now()
				WHERE user_id = ${userId} AND client_id = ${clientId} AND expires_at > now()
				RETURNING code
			)
		SELECT
			(SELECT count(*) FROM revoked_access_tokens)::text AS revoked_access_tokens,
			(SELECT count(*) FROM revoked_refresh_tokens)::text AS revoked_refresh_tokens,
			(SELECT count(*) FROM consumed_authorization_codes)::text AS consumed_authorization_codes
	`);

	const result = revocationResultFromRow(rows[0]);

	// Round 17 review finding (P2): the database write above only stops
	// FUTURE authentication. A `subscriptions/listen` stream opened before
	// this revoke authenticated once, when it opened, and would otherwise
	// keep delivering `resource_updated` events and keepalives to a client
	// the user just disconnected. Announced after the write commits, never
	// before — a client reconnecting in that window would re-authenticate
	// successfully against rows that are still live.
	await publishGrantRevocation(userId);
	consentLogger.info({ userId, clientId, ...result }, 'User revoked one client connection');
	return result;
}

/** The revoke-all half of the same acceptance criterion — every client this user has ever granted access to, revoked in one action. See `revokeUserClientGrant`'s comment for the authorization-code-consumption rationale, the atomic single-statement construction, and this fix's stated scope boundary; identical here, just unfiltered by `clientId`. */
export async function revokeAllUserGrants(userId: string): Promise<RevocationResult> {
	const { rows } = await database.execute<RevocationRow>(sql`
		WITH
			revoked_access_tokens AS (
				UPDATE oauth_tokens
				SET revoked_at = now()
				WHERE user_id = ${userId} AND revoked_at IS NULL
				RETURNING access_token
			),
			revoked_refresh_tokens AS (
				UPDATE oauth_refresh_tokens
				SET revoked_at = now()
				WHERE user_id = ${userId} AND revoked_at IS NULL
				RETURNING refresh_token
			),
			consumed_authorization_codes AS (
				-- See revokeUserClientGrant's own doc comment above.
				UPDATE oauth_codes
				SET used_at = now()
				WHERE user_id = ${userId} AND expires_at > now()
				RETURNING code
			)
		SELECT
			(SELECT count(*) FROM revoked_access_tokens)::text AS revoked_access_tokens,
			(SELECT count(*) FROM revoked_refresh_tokens)::text AS revoked_refresh_tokens,
			(SELECT count(*) FROM consumed_authorization_codes)::text AS consumed_authorization_codes
	`);

	const result = revocationResultFromRow(rows[0]);

	// Round 17 review finding (P2): the database write above only stops
	// FUTURE authentication. A `subscriptions/listen` stream opened before
	// this revoke authenticated once, when it opened, and would otherwise
	// keep delivering `resource_updated` events and keepalives to a client
	// the user just disconnected. Announced after the write commits, never
	// before — a client reconnecting in that window would re-authenticate
	// successfully against rows that are still live.
	await publishGrantRevocation(userId);
	consentLogger.info({ userId, ...result }, 'User revoked all client connections');
	return result;
}
