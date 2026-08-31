export { createPostgresOAuthSchema } from './schema.js';
export type { PostgresOAuthSchema, PostgresOAuthSchemaOptions } from './schema.js';
export type { PostgresOAuthDatabase } from './database.js';
export { PostgresTransactionStore } from './transaction-store.js';
export { PostgresCodeStore } from './code-store.js';
export { PostgresTokenStore } from './token-store.js';
export { PostgresClientStore } from './client-store.js';

import type { OAuthStores } from '../stores.js';
import { PostgresClientStore } from './client-store.js';
import { PostgresCodeStore } from './code-store.js';
import type { PostgresOAuthDatabase } from './database.js';
import type { PostgresOAuthSchema } from './schema.js';
import { PostgresTokenStore } from './token-store.js';
import { PostgresTransactionStore } from './transaction-store.js';

export function createPostgresOAuthStores(
	database: PostgresOAuthDatabase,
	schema: PostgresOAuthSchema,
): OAuthStores {
	const transactions = new PostgresTransactionStore(database, schema);
	const codes = new PostgresCodeStore(database, schema);
	const tokens = new PostgresTokenStore(database, schema);
	const clients = new PostgresClientStore(database, schema);
	return {
		transactions,
		codes,
		tokens,
		clients,
		async deleteAllForUser(userId) {
			const [transactionCount, codeCount, tokenCount] = await Promise.all([
				transactions.deleteAllForUser(userId),
				codes.deleteAllForUser(userId),
				tokens.deleteAllForUser(userId),
			]);
			return { transactions: transactionCount, codes: codeCount, tokens: tokenCount };
		},
	};
}
