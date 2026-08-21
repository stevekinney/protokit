import { and, eq, gt, isNull } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@template/mcp/logger';

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

	const byClientId = new Map<string, ConnectionSummary>();
	for (const row of [...liveAccessTokens, ...liveRefreshTokens]) {
		const existing = byClientId.get(row.clientId);
		if (!existing || row.expiresAt < existing.earliestExpiresAt) {
			byClientId.set(row.clientId, {
				clientId: row.clientId,
				clientName: row.clientName,
				earliestExpiresAt: row.expiresAt,
			});
		}
	}

	return [...byClientId.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
}

export type RevocationResult = {
	revokedAccessTokens: number;
	revokedRefreshTokens: number;
};

/**
 * Revokes every live access and refresh token this user has issued to one
 * client. "Revocation must terminate active MCP access, not merely hide a
 * record" (DATA-001) is satisfied structurally, not by anything this
 * function does specially: `/mcp` re-checks `revokedAt IS NULL` against the
 * database on every single request (`routes/mcp-routes.ts`), so the moment
 * this `UPDATE` commits, the very next `/mcp` call with the revoked token
 * 401s -- there is no cache or session-affinity layer between this write
 * and that check for a stale value to survive in.
 */
export async function revokeUserClientGrant(
	userId: string,
	clientId: string,
): Promise<RevocationResult> {
	const revokedAccessTokens = await database
		.update(schema.oauthTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(schema.oauthTokens.userId, userId),
				eq(schema.oauthTokens.clientId, clientId),
				isNull(schema.oauthTokens.revokedAt),
			),
		)
		.returning({ accessToken: schema.oauthTokens.accessToken });

	const revokedRefreshTokens = await database
		.update(schema.oauthRefreshTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(schema.oauthRefreshTokens.userId, userId),
				eq(schema.oauthRefreshTokens.clientId, clientId),
				isNull(schema.oauthRefreshTokens.revokedAt),
			),
		)
		.returning({ refreshToken: schema.oauthRefreshTokens.refreshToken });

	const result = {
		revokedAccessTokens: revokedAccessTokens.length,
		revokedRefreshTokens: revokedRefreshTokens.length,
	};
	consentLogger.info({ userId, clientId, ...result }, 'User revoked one client connection');
	return result;
}

/** The revoke-all half of the same acceptance criterion — every client this user has ever granted access to, revoked in one action. */
export async function revokeAllUserGrants(userId: string): Promise<RevocationResult> {
	const revokedAccessTokens = await database
		.update(schema.oauthTokens)
		.set({ revokedAt: new Date() })
		.where(and(eq(schema.oauthTokens.userId, userId), isNull(schema.oauthTokens.revokedAt)))
		.returning({ accessToken: schema.oauthTokens.accessToken });

	const revokedRefreshTokens = await database
		.update(schema.oauthRefreshTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(schema.oauthRefreshTokens.userId, userId),
				isNull(schema.oauthRefreshTokens.revokedAt),
			),
		)
		.returning({ refreshToken: schema.oauthRefreshTokens.refreshToken });

	const result = {
		revokedAccessTokens: revokedAccessTokens.length,
		revokedRefreshTokens: revokedRefreshTokens.length,
	};
	consentLogger.info({ userId, ...result }, 'User revoked all client connections');
	return result;
}
