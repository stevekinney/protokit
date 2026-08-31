import type { ConsumedAuthorizationTransaction, TransactionStore } from '../stores.js';
import {
	affectedRows,
	columnIdentifier,
	hashOpaqueValue,
	resultRows,
	sql,
	type PostgresOAuthDatabase,
} from './database.js';
import type { PostgresOAuthSchema } from './schema.js';

export class PostgresTransactionStore implements TransactionStore {
	constructor(
		private readonly database: PostgresOAuthDatabase,
		private readonly schema: PostgresOAuthSchema,
	) {}

	async create(input: Parameters<TransactionStore['create']>[0]): Promise<void> {
		const record = input.record;
		const userId = columnIdentifier(this.schema.transactions.userId);
		await this.database.execute(sql`INSERT INTO ${this.schema.transactions} (
			transaction_id_hash, csrf_token_hash, consent_binding_hash, ${userId}, client_id,
			redirect_uri, code_challenge, code_challenge_method, state, issuer, resource,
			scope, expires_at, consumed_at, created_at
		) VALUES (${hashOpaqueValue(input.transactionId)}, ${hashOpaqueValue(input.csrfToken)},
			${hashOpaqueValue(input.consentBinding)}, ${record.userId}, ${record.clientId},
			${record.redirectUri}, ${record.codeChallenge}, ${record.codeChallengeMethod},
			${record.state}, ${record.issuer}, ${record.resource}, ${record.scope},
			${record.expiresAt}, ${record.consumedAt}, ${record.createdAt})`);
	}

	async consume(
		transactionId: string,
		csrfToken: string,
		binding: string,
	): Promise<ConsumedAuthorizationTransaction | null> {
		const userId = columnIdentifier(this.schema.transactions.userId);
		const result = await this.database.execute(sql`UPDATE ${this.schema.transactions}
			SET consumed_at = date_trunc('milliseconds', clock_timestamp())
			WHERE transaction_id_hash = ${hashOpaqueValue(transactionId)}
				AND csrf_token_hash = ${hashOpaqueValue(csrfToken)}
				AND consent_binding_hash = ${hashOpaqueValue(binding)}
				AND consumed_at IS NULL AND expires_at > clock_timestamp()
			RETURNING transaction_id_hash AS "transactionIdHash", ${userId}::text AS "userId",
				client_id AS "clientId", redirect_uri AS "redirectUri", code_challenge AS "codeChallenge",
				code_challenge_method AS "codeChallengeMethod", state, issuer, resource, scope,
				expires_at AS "expiresAt", consumed_at AS "consumedAt", created_at AS "createdAt"`);
		return resultRows<ConsumedAuthorizationTransaction>(result)[0] ?? null;
	}

	async unconsume(transactionId: string, consumedAt: Date): Promise<boolean> {
		return (
			affectedRows(
				await this.database.execute(sql`UPDATE ${this.schema.transactions} SET consumed_at = NULL
			WHERE transaction_id_hash = ${hashOpaqueValue(transactionId)} AND consumed_at = ${consumedAt} RETURNING 1`),
			) === 1
		);
	}

	async deleteByBinding(value: string): Promise<number> {
		return affectedRows(
			await this.database.execute(sql`DELETE FROM ${this.schema.transactions}
			WHERE consent_binding_hash = ${hashOpaqueValue(value)} RETURNING 1`),
		);
	}

	async deleteAllForUser(userId: string): Promise<number> {
		const userIdColumn = columnIdentifier(this.schema.transactions.userId);
		return affectedRows(
			await this.database.execute(
				sql`DELETE FROM ${this.schema.transactions} WHERE ${userIdColumn} = ${userId} RETURNING 1`,
			),
		);
	}

	async purgeExpired(now: Date): Promise<number> {
		return affectedRows(
			await this.database.execute(
				sql`DELETE FROM ${this.schema.transactions} WHERE expires_at <= ${now} RETURNING 1`,
			),
		);
	}
}
