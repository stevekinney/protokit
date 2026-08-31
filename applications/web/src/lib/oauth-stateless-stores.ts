import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { database, schema } from '@template/database';
import type {
	ClientStore,
	CodeStore,
	ConsumedAuthorizationCode,
	RegisteredClient,
	TokenStore,
} from '@lostgradient/mcp/oauth/stores';

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows))
		return result.rows as T[];
	return [];
}

const clients: ClientStore = {
	async register(record) {
		await database.insert(schema.oauthClients).values({
			clientId: record.clientId,
			clientSecret: record.clientSecretHash,
			clientName: record.clientName,
			clientType: record.clientType,
			tokenEndpointAuthMethod: record.tokenEndpointAuthMethod,
			applicationType: record.applicationType,
			redirectUris: record.redirectUris,
			grantTypes: record.grantTypes,
			responseTypes: record.responseTypes,
			clientIdMetadataUrl: record.clientIdMetadataUrl,
			clientSecretExpiresAt: record.clientSecretExpiresAt,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		});
	},
	async upsert(record) {
		await database
			.insert(schema.oauthClients)
			.values({
				clientId: record.clientId,
				clientSecret: record.clientSecretHash,
				clientName: record.clientName,
				clientType: record.clientType,
				tokenEndpointAuthMethod: record.tokenEndpointAuthMethod,
				applicationType: record.applicationType,
				redirectUris: record.redirectUris,
				grantTypes: record.grantTypes,
				responseTypes: record.responseTypes,
				clientIdMetadataUrl: record.clientIdMetadataUrl,
				clientSecretExpiresAt: record.clientSecretExpiresAt,
				createdAt: record.createdAt,
				updatedAt: record.updatedAt,
			})
			.onConflictDoUpdate({
				target: schema.oauthClients.clientId,
				set: {
					clientSecret: record.clientSecretHash,
					clientName: record.clientName,
					clientType: record.clientType,
					tokenEndpointAuthMethod: record.tokenEndpointAuthMethod,
					applicationType: record.applicationType,
					redirectUris: record.redirectUris,
					grantTypes: record.grantTypes,
					responseTypes: record.responseTypes,
					clientIdMetadataUrl: record.clientIdMetadataUrl,
					clientSecretExpiresAt: record.clientSecretExpiresAt,
					updatedAt: record.updatedAt,
				},
			});
	},
	async findById(clientId) {
		const [record] = await database
			.select()
			.from(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, clientId))
			.limit(1);
		if (!record) return null;
		return { ...record, clientSecretHash: record.clientSecret } satisfies RegisteredClient;
	},
	async update(clientId, patch) {
		await database
			.update(schema.oauthClients)
			.set({
				...(patch.clientSecretHash !== undefined ? { clientSecret: patch.clientSecretHash } : {}),
				...(patch.clientName !== undefined ? { clientName: patch.clientName } : {}),
				...(patch.clientType !== undefined ? { clientType: patch.clientType } : {}),
				...(patch.tokenEndpointAuthMethod !== undefined
					? { tokenEndpointAuthMethod: patch.tokenEndpointAuthMethod }
					: {}),
				...(patch.applicationType !== undefined ? { applicationType: patch.applicationType } : {}),
				...(patch.redirectUris !== undefined ? { redirectUris: patch.redirectUris } : {}),
				...(patch.grantTypes !== undefined ? { grantTypes: patch.grantTypes } : {}),
				...(patch.responseTypes !== undefined ? { responseTypes: patch.responseTypes } : {}),
				...(patch.clientIdMetadataUrl !== undefined
					? { clientIdMetadataUrl: patch.clientIdMetadataUrl }
					: {}),
				...(patch.clientSecretExpiresAt !== undefined
					? { clientSecretExpiresAt: patch.clientSecretExpiresAt }
					: {}),
				...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {}),
			})
			.where(eq(schema.oauthClients.clientId, clientId));
	},
};

const codes: CodeStore = {
	async issue(record) {
		await database.insert(schema.oauthCodes).values({ ...record, code: record.codeHash });
	},
	async findByHash(codeHash) {
		const [record] = await database
			.select()
			.from(schema.oauthCodes)
			.where(eq(schema.oauthCodes.code, codeHash))
			.limit(1);
		return record ? { ...record, codeHash: record.code } : null;
	},
	async consume(codeHash, now) {
		const [record] = await database
			.update(schema.oauthCodes)
			.set({ usedAt: now })
			.where(
				and(
					eq(schema.oauthCodes.code, codeHash),
					isNull(schema.oauthCodes.usedAt),
					gt(schema.oauthCodes.expiresAt, now),
				),
			)
			.returning();
		return record
			? ({
					...record,
					codeHash: record.code,
					usedAt: record.usedAt!,
				} satisfies ConsumedAuthorizationCode)
			: null;
	},
	async unconsume(codeHash, usedAt) {
		const [record] = await database
			.update(schema.oauthCodes)
			.set({ usedAt: null })
			.where(and(eq(schema.oauthCodes.code, codeHash), eq(schema.oauthCodes.usedAt, usedAt)))
			.returning({ code: schema.oauthCodes.code });
		return Boolean(record);
	},
	async deleteAllForUser(userId) {
		return (
			await database
				.delete(schema.oauthCodes)
				.where(eq(schema.oauthCodes.userId, userId))
				.returning({ code: schema.oauthCodes.code })
		).length;
	},
	async purgeExpired(now) {
		return (
			await database
				.delete(schema.oauthCodes)
				.where(sql`${schema.oauthCodes.expiresAt} <= ${now}`)
				.returning({ code: schema.oauthCodes.code })
		).length;
	},
};

const tokens: TokenStore = {
	async issueAuthorizationGrant(input) {
		const access = input.accessToken;
		const refresh = input.refreshToken;
		await database.execute(sql`WITH inserted_access AS (
			INSERT INTO oauth_tokens (access_token, client_id, user_id, scope, resource, expires_at, revoked_at, created_at)
			VALUES (${access.accessTokenHash}, ${access.clientId}, ${access.userId}::uuid, ${access.scope}, ${access.resource}, ${access.expiresAt}, ${access.revokedAt}, ${access.createdAt})
			RETURNING access_token
		) ${
			refresh
				? sql`INSERT INTO oauth_refresh_tokens (refresh_token, client_id, user_id, scope, resource, access_token_hash, family_id, expires_at, revoked_at, created_at)
			SELECT ${refresh.refreshTokenHash}, ${refresh.clientId}, ${refresh.userId}::uuid, ${refresh.scope}, ${refresh.resource}, access_token, ${refresh.familyId}, ${refresh.expiresAt}, ${refresh.revokedAt}, ${refresh.createdAt} FROM inserted_access`
				: sql`SELECT access_token FROM inserted_access`
		}`);
	},
	async findByHash(tokenHash) {
		const [record] = await database
			.select()
			.from(schema.oauthTokens)
			.where(eq(schema.oauthTokens.accessToken, tokenHash))
			.limit(1);
		return record ? { ...record, accessTokenHash: record.accessToken } : null;
	},
	async rotateRefreshToken(input) {
		const [prior] = await database
			.select()
			.from(schema.oauthRefreshTokens)
			.where(
				and(
					eq(schema.oauthRefreshTokens.refreshToken, input.priorHash),
					eq(schema.oauthRefreshTokens.clientId, input.clientId),
					eq(schema.oauthRefreshTokens.resource, input.resource),
				),
			)
			.limit(1);
		if (!prior) return { status: 'invalid' };
		if (prior.revokedAt) {
			await tokens.revokeFamily(prior.familyId);
			return { status: 'replay_revoked', userId: prior.userId };
		}
		if (prior.expiresAt <= input.createdAt) return { status: 'invalid' };
		if (input.requestedScope) {
			const granted = new Set((prior.scope ?? '').split(/\s+/).filter(Boolean));
			if (input.requestedScope.split(/\s+/).some((scope) => !granted.has(scope)))
				return { status: 'scope_rejected' };
		}
		const scope = input.requestedScope ?? prior.scope;
		await database.execute(sql`WITH inserted_access AS (
			INSERT INTO oauth_tokens (access_token, client_id, user_id, scope, resource, expires_at, revoked_at, created_at)
			VALUES (${input.nextAccessTokenHash}, ${prior.clientId}, ${prior.userId}::uuid, ${scope}, ${prior.resource}, ${input.accessTokenExpiresAt}, NULL, ${input.createdAt}) RETURNING access_token
		) INSERT INTO oauth_refresh_tokens (refresh_token, client_id, user_id, scope, resource, access_token_hash, family_id, expires_at, revoked_at, created_at)
		SELECT ${input.nextRefreshTokenHash}, ${prior.clientId}, ${prior.userId}::uuid, ${scope}, ${prior.resource}, access_token, ${prior.familyId}, ${input.refreshTokenExpiresAt}, NULL, ${input.createdAt} FROM inserted_access`);
		const [consumed] = await database
			.update(schema.oauthRefreshTokens)
			.set({ revokedAt: input.createdAt })
			.where(
				and(
					eq(schema.oauthRefreshTokens.refreshToken, input.priorHash),
					eq(schema.oauthRefreshTokens.clientId, input.clientId),
					eq(schema.oauthRefreshTokens.resource, input.resource),
					isNull(schema.oauthRefreshTokens.revokedAt),
					gt(schema.oauthRefreshTokens.expiresAt, input.createdAt),
				),
			)
			.returning();
		if (!consumed) {
			await database
				.delete(schema.oauthRefreshTokens)
				.where(eq(schema.oauthRefreshTokens.refreshToken, input.nextRefreshTokenHash));
			await database
				.delete(schema.oauthTokens)
				.where(eq(schema.oauthTokens.accessToken, input.nextAccessTokenHash));
			const [replayed] = await database
				.select()
				.from(schema.oauthRefreshTokens)
				.where(
					and(
						eq(schema.oauthRefreshTokens.refreshToken, input.priorHash),
						eq(schema.oauthRefreshTokens.clientId, input.clientId),
						eq(schema.oauthRefreshTokens.resource, input.resource),
					),
				)
				.limit(1);
			if (replayed?.revokedAt) {
				await tokens.revokeFamily(replayed.familyId);
				return { status: 'replay_revoked', userId: replayed.userId };
			}
			return { status: 'invalid' };
		}
		try {
			await database
				.update(schema.oauthTokens)
				.set({ revokedAt: input.createdAt })
				.where(
					and(
						eq(schema.oauthTokens.accessToken, prior.accessTokenHash),
						isNull(schema.oauthTokens.revokedAt),
					),
				);
		} catch {
			// Rotation already committed. The replacement credentials remain the
			// only usable refresh path, and a later family replay closes any orphan.
		}
		return {
			status: 'rotated',
			accessToken: {
				accessTokenHash: input.nextAccessTokenHash,
				clientId: prior.clientId,
				userId: prior.userId,
				scope,
				resource: prior.resource,
				expiresAt: input.accessTokenExpiresAt,
				revokedAt: null,
				createdAt: input.createdAt,
			},
			refreshToken: {
				refreshTokenHash: input.nextRefreshTokenHash,
				clientId: prior.clientId,
				userId: prior.userId,
				scope,
				resource: prior.resource,
				accessTokenHash: input.nextAccessTokenHash,
				familyId: prior.familyId,
				expiresAt: input.refreshTokenExpiresAt,
				revokedAt: null,
				createdAt: input.createdAt,
			},
		};
	},
	async revokeAccessToken(tokenHash, clientId) {
		const result = await database.execute(sql`WITH revoked_access AS (
			UPDATE oauth_tokens SET revoked_at = COALESCE(revoked_at, clock_timestamp()) WHERE access_token = ${tokenHash} AND client_id = ${clientId} RETURNING access_token
		), revoked_refresh AS (
			UPDATE oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, clock_timestamp()) WHERE access_token_hash IN (SELECT access_token FROM revoked_access)
		) SELECT access_token FROM revoked_access`);
		return rows(result).length === 1;
	},
	async revokeRefreshToken(tokenHash, clientId) {
		const [prior] = await database
			.select()
			.from(schema.oauthRefreshTokens)
			.where(
				and(
					eq(schema.oauthRefreshTokens.refreshToken, tokenHash),
					eq(schema.oauthRefreshTokens.clientId, clientId),
					gt(schema.oauthRefreshTokens.expiresAt, new Date()),
				),
			)
			.limit(1);
		if (!prior) return { status: 'invalid' };
		if (prior.revokedAt) {
			await tokens.revokeFamily(prior.familyId);
			return { status: 'replay_revoked', userId: prior.userId };
		}
		const [revoked] = await database
			.update(schema.oauthRefreshTokens)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(schema.oauthRefreshTokens.refreshToken, tokenHash),
					eq(schema.oauthRefreshTokens.clientId, clientId),
					isNull(schema.oauthRefreshTokens.revokedAt),
				),
			)
			.returning();
		if (!revoked) {
			await tokens.revokeFamily(prior.familyId);
			return { status: 'replay_revoked', userId: prior.userId };
		}
		try {
			await database
				.update(schema.oauthTokens)
				.set({ revokedAt: new Date() })
				.where(
					and(
						eq(schema.oauthTokens.accessToken, revoked.accessTokenHash),
						isNull(schema.oauthTokens.revokedAt),
					),
				);
		} catch {
			// The presented refresh token is already revoked; RFC 7009 keeps the
			// response successful even if paired-token cleanup fails afterward.
		}
		return { status: 'revoked', userId: prior.userId };
	},
	async revokeFamily(familyId) {
		const result = await database.execute(sql`WITH family_members AS MATERIALIZED (
			SELECT access_token_hash FROM oauth_refresh_tokens WHERE family_id = ${familyId}
		), revoked_refresh AS (
			UPDATE oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, clock_timestamp()) WHERE family_id = ${familyId} RETURNING 1
		), revoked_access AS (
			UPDATE oauth_tokens SET revoked_at = COALESCE(revoked_at, clock_timestamp()) WHERE access_token IN (SELECT access_token_hash FROM family_members) RETURNING 1
		) SELECT (SELECT count(*) FROM revoked_refresh) + (SELECT count(*) FROM revoked_access) AS count`);
		return Number(rows<{ count: string | number }>(result)[0]?.count ?? 0);
	},
	async deleteAllForUser(userId) {
		const result = await database.execute(
			sql`WITH deleted_refresh AS (DELETE FROM oauth_refresh_tokens WHERE user_id = ${userId}::uuid RETURNING 1), deleted_access AS (DELETE FROM oauth_tokens WHERE user_id = ${userId}::uuid RETURNING 1) SELECT (SELECT count(*) FROM deleted_refresh) + (SELECT count(*) FROM deleted_access) AS count`,
		);
		return Number(rows<{ count: string | number }>(result)[0]?.count ?? 0);
	},
	async purgeExpired(now) {
		const result = await database.execute(
			sql`WITH deleted_refresh AS (DELETE FROM oauth_refresh_tokens WHERE expires_at <= ${now} RETURNING 1), deleted_access AS (DELETE FROM oauth_tokens access WHERE expires_at <= ${now} AND NOT EXISTS (SELECT 1 FROM oauth_refresh_tokens refresh WHERE refresh.access_token_hash = access.access_token AND refresh.expires_at > ${now}) RETURNING 1) SELECT (SELECT count(*) FROM deleted_refresh) + (SELECT count(*) FROM deleted_access) AS count`,
		);
		return Number(rows<{ count: string | number }>(result)[0]?.count ?? 0);
	},
};

export const oauthStatelessStores = { clients, codes, tokens };
