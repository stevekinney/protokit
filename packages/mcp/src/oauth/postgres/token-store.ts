import type { AccessToken, RefreshToken, TokenStore } from '../stores.js';
import {
	columnIdentifier,
	countRows,
	qualifiedColumnIdentifier,
	resultRows,
	sql,
	type PostgresOAuthDatabase,
} from './database.js';
import type { PostgresOAuthSchema } from './schema.js';

function returnedAccessToken(userId: ReturnType<typeof columnIdentifier>) {
	return sql`access_token_hash AS "accessTokenHash", client_id AS "clientId", ${userId}::text AS "userId",
		scope, resource, expires_at AS "expiresAt", revoked_at AS "revokedAt", created_at AS "createdAt"`;
}

export class PostgresTokenStore implements TokenStore {
	constructor(
		private readonly database: PostgresOAuthDatabase,
		private readonly schema: PostgresOAuthSchema,
	) {}

	async issueAuthorizationGrant(
		input: Parameters<TokenStore['issueAuthorizationGrant']>[0],
	): Promise<void> {
		const access = input.accessToken;
		const refresh = input.refreshToken;
		const accessUserId = columnIdentifier(this.schema.accessTokens.userId);
		const refreshUserId = columnIdentifier(this.schema.refreshTokens.userId);
		await this.database.execute(sql`WITH inserted_access AS (
			INSERT INTO ${this.schema.accessTokens} (access_token_hash, client_id, ${accessUserId}, scope, resource, expires_at, revoked_at, created_at)
			VALUES (${access.accessTokenHash}, ${access.clientId}, ${access.userId}, ${access.scope}, ${access.resource},
				${access.expiresAt}, ${access.revokedAt}, ${access.createdAt}) RETURNING access_token_hash
		) ${
			refresh
				? sql`INSERT INTO ${this.schema.refreshTokens} (refresh_token_hash, client_id, ${refreshUserId}, scope, resource,
			access_token_hash, family_id, expires_at, revoked_at, created_at)
			SELECT ${refresh.refreshTokenHash}, ${refresh.clientId}, ${refresh.userId}, ${refresh.scope}, ${refresh.resource},
				access_token_hash, ${refresh.familyId}, ${refresh.expiresAt}, ${refresh.revokedAt}, ${refresh.createdAt} FROM inserted_access`
				: sql`SELECT access_token_hash FROM inserted_access`
		}`);
	}

	async findByHash(tokenHash: string): Promise<AccessToken | null> {
		const userId = columnIdentifier(this.schema.accessTokens.userId);
		const result = await this.database
			.execute(sql`SELECT ${returnedAccessToken(userId)} FROM ${this.schema.accessTokens}
			WHERE access_token_hash = ${tokenHash}`);
		return resultRows<AccessToken>(result)[0] ?? null;
	}

	async rotateRefreshToken(
		input: Parameters<TokenStore['rotateRefreshToken']>[0],
	): ReturnType<TokenStore['rotateRefreshToken']> {
		return this.database.transaction(async (transaction) => {
			const accessUserId = columnIdentifier(this.schema.accessTokens.userId);
			const refreshUserId = columnIdentifier(this.schema.refreshTokens.userId);
			const priorUserId = qualifiedColumnIdentifier('prior', this.schema.refreshTokens.userId);
			const accessResultUserId = qualifiedColumnIdentifier('a', this.schema.accessTokens.userId);
			const refreshResultUserId = qualifiedColumnIdentifier('r', this.schema.refreshTokens.userId);
			const familyResult = await transaction.execute(
				sql`SELECT family_id AS "familyId" FROM ${this.schema.refreshTokens}
				WHERE refresh_token_hash = ${input.priorHash}
					AND client_id = ${input.clientId} AND resource = ${input.resource}`,
			);
			const familyId = resultRows<{ familyId: string }>(familyResult)[0]?.familyId;
			if (!familyId) return { status: 'invalid' };
			await transaction.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}, 0))`,
			);

			const result = await transaction.execute(sql`WITH prior AS MATERIALIZED (
			SELECT * FROM ${this.schema.refreshTokens} WHERE refresh_token_hash = ${input.priorHash}
				AND client_id = ${input.clientId} AND resource = ${input.resource} FOR UPDATE
		), live AS (
			SELECT * FROM prior WHERE revoked_at IS NULL AND expires_at > ${input.createdAt}
		), replayable AS (
			SELECT * FROM prior WHERE revoked_at IS NOT NULL
		), eligible AS (
			SELECT * FROM live WHERE (${input.requestedScope ?? null}::text IS NULL OR NOT EXISTS (
					SELECT requested_scope FROM unnest(string_to_array(${input.requestedScope ?? ''}, ' ')) requested_scope
					WHERE requested_scope <> '' AND requested_scope <> ALL(string_to_array(COALESCE(live.scope, ''), ' '))))
		), revoked_prior AS (
			UPDATE ${this.schema.refreshTokens} SET revoked_at = ${input.createdAt}
			WHERE refresh_token_hash IN (SELECT refresh_token_hash FROM eligible) RETURNING *
		), revoked_access AS (
			UPDATE ${this.schema.accessTokens} SET revoked_at = ${input.createdAt}
			WHERE access_token_hash IN (SELECT access_token_hash FROM revoked_prior) RETURNING access_token_hash
		), inserted_access AS (
			INSERT INTO ${this.schema.accessTokens} (access_token_hash, client_id, ${accessUserId}, scope, resource, expires_at, revoked_at, created_at)
			SELECT ${input.nextAccessTokenHash}, client_id, ${refreshUserId}, COALESCE(${input.requestedScope ?? null}::text, scope),
				resource, ${input.accessTokenExpiresAt}, NULL, ${input.createdAt} FROM revoked_prior
			RETURNING *
		), inserted_refresh AS (
			INSERT INTO ${this.schema.refreshTokens} (refresh_token_hash, client_id, ${refreshUserId}, scope, resource,
				access_token_hash, family_id, expires_at, revoked_at, created_at)
			SELECT ${input.nextRefreshTokenHash}, prior.client_id, ${priorUserId},
				COALESCE(${input.requestedScope ?? null}::text, prior.scope), prior.resource,
				inserted_access.access_token_hash, prior.family_id, ${input.refreshTokenExpiresAt}, NULL, ${input.createdAt}
			FROM revoked_prior prior CROSS JOIN inserted_access RETURNING *
		), replay_refresh AS (
			UPDATE ${this.schema.refreshTokens} SET revoked_at = COALESCE(revoked_at, ${input.createdAt})
			WHERE family_id IN (SELECT family_id FROM replayable) AND revoked_at IS NULL RETURNING access_token_hash
		), replay_access AS (
			UPDATE ${this.schema.accessTokens} SET revoked_at = COALESCE(revoked_at, ${input.createdAt})
			WHERE access_token_hash IN (SELECT access_token_hash FROM replay_refresh) RETURNING access_token_hash
		)
		SELECT CASE
			WHEN EXISTS (SELECT 1 FROM inserted_refresh) THEN 'rotated'
			WHEN EXISTS (SELECT 1 FROM replayable) THEN 'replay_revoked'
			WHEN EXISTS (SELECT 1 FROM live) AND ${input.requestedScope ?? null}::text IS NOT NULL THEN 'scope_rejected'
			ELSE 'invalid' END AS status,
			(SELECT ${refreshUserId}::text FROM prior LIMIT 1) AS "userId",
			(SELECT family_id FROM prior LIMIT 1) AS "familyId",
			(SELECT jsonb_set(to_jsonb(a), '{user_id}', to_jsonb(${accessResultUserId}::text))
				FROM inserted_access a LIMIT 1) AS access,
			(SELECT jsonb_set(to_jsonb(r), '{user_id}', to_jsonb(${refreshResultUserId}::text))
				FROM inserted_refresh r LIMIT 1) AS refresh`);
			const row = resultRows<{
				status: 'rotated' | 'replay_revoked' | 'scope_rejected' | 'invalid';
				userId?: string;
				familyId?: string;
				access?: Record<string, unknown>;
				refresh?: Record<string, unknown>;
			}>(result)[0];
			if (!row || row.status === 'invalid') return { status: 'invalid' };
			if (row.status === 'scope_rejected') return { status: 'scope_rejected' };
			if (row.status === 'replay_revoked')
				return { status: 'replay_revoked', userId: row.userId!, familyId: row.familyId! };
			return {
				status: 'rotated',
				accessToken: mapAccess(row.access!),
				refreshToken: mapRefresh(row.refresh!),
			};
		});
	}

	async revokeAccessToken(tokenHash: string, clientId: string): Promise<boolean> {
		return this.database.transaction(async (transaction) => {
			const familyResult = await transaction.execute(
				sql`SELECT family_id AS "familyId" FROM ${this.schema.refreshTokens}
				WHERE access_token_hash = ${tokenHash} AND client_id = ${clientId}`,
			);
			const familyId = resultRows<{ familyId: string }>(familyResult)[0]?.familyId;
			if (familyId) {
				await transaction.execute(
					sql`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}, 0))`,
				);
			}
			const result = await transaction.execute(sql`WITH target AS MATERIALIZED (
				SELECT access.revoked_at AS "revokedAt", refresh.family_id AS "familyId"
				FROM ${this.schema.accessTokens} access
				LEFT JOIN ${this.schema.refreshTokens} refresh
					ON refresh.access_token_hash = access.access_token_hash
					AND refresh.client_id = access.client_id
				WHERE access.access_token_hash = ${tokenHash} AND access.client_id = ${clientId}
			), family_members AS MATERIALIZED (
				SELECT access_token_hash FROM ${this.schema.refreshTokens}
				WHERE family_id IN (SELECT "familyId" FROM target WHERE "revokedAt" IS NOT NULL)
			), revoked_refresh AS (
				UPDATE ${this.schema.refreshTokens} SET revoked_at = clock_timestamp()
				WHERE revoked_at IS NULL AND (
					access_token_hash IN (SELECT ${tokenHash} FROM target WHERE "revokedAt" IS NULL)
					OR access_token_hash IN (SELECT access_token_hash FROM family_members)
				)
				RETURNING 1
			), revoked_access AS (
				UPDATE ${this.schema.accessTokens} SET revoked_at = clock_timestamp()
				WHERE revoked_at IS NULL AND client_id = ${clientId} AND (
					access_token_hash IN (SELECT ${tokenHash} FROM target)
					OR access_token_hash IN (SELECT access_token_hash FROM family_members)
				)
				RETURNING 1
			) SELECT
				(SELECT count(*) FROM revoked_access) + (SELECT count(*) FROM revoked_refresh) AS count`);
			return countRows(result) > 0;
		});
	}

	async revokeRefreshToken(
		tokenHash: string,
		clientId: string,
	): ReturnType<TokenStore['revokeRefreshToken']> {
		return this.database.transaction(async (transaction) => {
			const priorUserId = columnIdentifier(this.schema.refreshTokens.userId);
			const familyResult = await transaction.execute(
				sql`SELECT family_id AS "familyId" FROM ${this.schema.refreshTokens}
					WHERE refresh_token_hash = ${tokenHash}
						AND client_id = ${clientId}`,
			);
			const familyId = resultRows<{ familyId: string }>(familyResult)[0]?.familyId;
			if (!familyId) return { status: 'invalid' };
			await transaction.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}, 0))`,
			);

			const result = await transaction.execute(sql`WITH prior AS MATERIALIZED (
				SELECT * FROM ${this.schema.refreshTokens} WHERE refresh_token_hash = ${tokenHash}
					AND client_id = ${clientId} FOR UPDATE
		), family_members AS MATERIALIZED (
			SELECT access_token_hash FROM ${this.schema.refreshTokens}
			WHERE family_id IN (SELECT family_id FROM prior WHERE revoked_at IS NOT NULL)
		), revoked_family_refresh AS (
			UPDATE ${this.schema.refreshTokens} SET revoked_at = clock_timestamp()
			WHERE family_id IN (SELECT family_id FROM prior WHERE revoked_at IS NOT NULL) AND revoked_at IS NULL
		), revoked_family_access AS (
			UPDATE ${this.schema.accessTokens} SET revoked_at = clock_timestamp()
			WHERE access_token_hash IN (SELECT access_token_hash FROM family_members) AND revoked_at IS NULL
			), revoked_refresh AS (
				UPDATE ${this.schema.refreshTokens} SET revoked_at = clock_timestamp()
				WHERE refresh_token_hash IN (
					SELECT refresh_token_hash FROM prior
					WHERE revoked_at IS NULL AND expires_at > clock_timestamp()
				)
			RETURNING access_token_hash
		), revoked_access AS (
			UPDATE ${this.schema.accessTokens} SET revoked_at = clock_timestamp()
			WHERE access_token_hash IN (SELECT access_token_hash FROM revoked_refresh) AND revoked_at IS NULL
		)
			SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM prior) THEN 'invalid'
				WHEN EXISTS (SELECT 1 FROM prior WHERE revoked_at IS NOT NULL) THEN 'replay_revoked'
				WHEN EXISTS (SELECT 1 FROM revoked_refresh) THEN 'revoked'
				ELSE 'invalid' END AS status,
			(SELECT ${priorUserId}::text FROM prior LIMIT 1) AS "userId",
			(SELECT family_id FROM prior LIMIT 1) AS "familyId"`);
			const row = resultRows<{
				status: 'invalid' | 'revoked' | 'replay_revoked';
				userId: string | null;
				familyId: string | null;
			}>(result)[0];
			if (!row || row.status === 'invalid') return { status: 'invalid' };
			return { status: row.status, userId: row.userId!, familyId: row.familyId! };
		});
	}

	async revokeFamily(familyId: string): Promise<number> {
		return this.database.transaction(async (transaction) => {
			await transaction.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}, 0))`,
			);
			const result = await transaction.execute(sql`WITH family_members AS MATERIALIZED (
			SELECT access_token_hash FROM ${this.schema.refreshTokens} WHERE family_id = ${familyId}
		), revoked_refresh AS (
			UPDATE ${this.schema.refreshTokens} SET revoked_at = clock_timestamp()
			WHERE family_id = ${familyId} AND revoked_at IS NULL RETURNING 1
		), revoked_access AS (
			UPDATE ${this.schema.accessTokens} SET revoked_at = clock_timestamp()
			WHERE access_token_hash IN (SELECT access_token_hash FROM family_members) AND revoked_at IS NULL RETURNING 1
		) SELECT (SELECT count(*) FROM revoked_refresh) + (SELECT count(*) FROM revoked_access) AS count`);
			return countRows(result);
		});
	}

	async deleteAllForUser(userId: string): Promise<number> {
		const accessUserId = columnIdentifier(this.schema.accessTokens.userId);
		const refreshUserId = columnIdentifier(this.schema.refreshTokens.userId);
		const result = await this.database.execute(sql`WITH deleted_refresh AS (
			DELETE FROM ${this.schema.refreshTokens} WHERE ${refreshUserId} = ${userId} RETURNING 1
		), deleted_access AS (
			DELETE FROM ${this.schema.accessTokens} WHERE ${accessUserId} = ${userId} RETURNING 1
		) SELECT (SELECT count(*) FROM deleted_refresh) + (SELECT count(*) FROM deleted_access) AS count`);
		return countRows(result);
	}

	async purgeExpired(now: Date): Promise<number> {
		const result = await this.database.execute(sql`WITH deleted_refresh AS (
			DELETE FROM ${this.schema.refreshTokens} WHERE expires_at <= ${now} RETURNING 1
		), deleted_access AS (
			DELETE FROM ${this.schema.accessTokens} access WHERE expires_at <= ${now}
				AND NOT EXISTS (SELECT 1 FROM ${this.schema.refreshTokens} refresh
					WHERE refresh.access_token_hash = access.access_token_hash AND refresh.expires_at > ${now}) RETURNING 1
		) SELECT (SELECT count(*) FROM deleted_refresh) + (SELECT count(*) FROM deleted_access) AS count`);
		return countRows(result);
	}
}

function mapAccess(row: Record<string, unknown>): AccessToken {
	return {
		accessTokenHash: row.access_token_hash as string,
		clientId: row.client_id as string,
		userId: String(row.user_id),
		scope: row.scope as string | null,
		resource: row.resource as string,
		expiresAt: new Date(row.expires_at as string),
		revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
		createdAt: new Date(row.created_at as string),
	};
}

function mapRefresh(row: Record<string, unknown>): RefreshToken {
	return {
		refreshTokenHash: row.refresh_token_hash as string,
		clientId: row.client_id as string,
		userId: String(row.user_id),
		scope: row.scope as string | null,
		resource: row.resource as string,
		accessTokenHash: row.access_token_hash as string,
		familyId: row.family_id as string,
		expiresAt: new Date(row.expires_at as string),
		revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
		createdAt: new Date(row.created_at as string),
	};
}
