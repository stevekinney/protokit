import type { AuthorizationCode, CodeStore, ConsumedAuthorizationCode } from '../stores.js';
import { affectedRows, resultRows, sql, type PostgresOAuthDatabase } from './database.js';
import type { PostgresOAuthSchema } from './schema.js';

const returnedCode = sql`code_hash AS "codeHash", client_id AS "clientId", user_id::text AS "userId",
	redirect_uri AS "redirectUri", code_challenge AS "codeChallenge", code_challenge_method AS "codeChallengeMethod",
	scope, state, resource, expires_at AS "expiresAt", used_at AS "usedAt", created_at AS "createdAt"`;

export class PostgresCodeStore implements CodeStore {
	constructor(
		private readonly database: PostgresOAuthDatabase,
		private readonly schema: PostgresOAuthSchema,
	) {}

	async issue(record: AuthorizationCode): Promise<void> {
		await this.database.execute(sql`INSERT INTO ${this.schema.codes} (code_hash, client_id, user_id,
			redirect_uri, code_challenge, code_challenge_method, scope, state, resource, expires_at, used_at, created_at)
			VALUES (${record.codeHash}, ${record.clientId}, ${record.userId}, ${record.redirectUri},
			${record.codeChallenge}, ${record.codeChallengeMethod}, ${record.scope}, ${record.state},
			${record.resource}, ${record.expiresAt}, ${record.usedAt}, ${record.createdAt})`);
	}

	async findByHash(codeHash: string): Promise<AuthorizationCode | null> {
		const result = await this.database.execute(
			sql`SELECT ${returnedCode} FROM ${this.schema.codes} WHERE code_hash = ${codeHash}`,
		);
		return resultRows<AuthorizationCode>(result)[0] ?? null;
	}

	async consume(codeHash: string, now: Date): Promise<ConsumedAuthorizationCode | null> {
		const result = await this.database
			.execute(sql`UPDATE ${this.schema.codes} SET used_at = date_trunc('milliseconds', clock_timestamp())
			WHERE code_hash = ${codeHash} AND used_at IS NULL AND expires_at > ${now} RETURNING ${returnedCode}`);
		return resultRows<ConsumedAuthorizationCode>(result)[0] ?? null;
	}

	async unconsume(codeHash: string, usedAt: Date): Promise<boolean> {
		return (
			affectedRows(
				await this.database.execute(sql`UPDATE ${this.schema.codes} SET used_at = NULL
			WHERE code_hash = ${codeHash} AND used_at = ${usedAt} RETURNING 1`),
			) === 1
		);
	}

	async deleteAllForUser(userId: string): Promise<number> {
		return affectedRows(
			await this.database.execute(
				sql`DELETE FROM ${this.schema.codes} WHERE user_id = ${userId} RETURNING 1`,
			),
		);
	}

	async purgeExpired(now: Date): Promise<number> {
		return affectedRows(
			await this.database.execute(
				sql`DELETE FROM ${this.schema.codes} WHERE expires_at <= ${now} RETURNING 1`,
			),
		);
	}
}
