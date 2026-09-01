import { describe, expect, test } from 'bun:test';
import { getTableConfig, integer, pgTable, serial, uuid } from 'drizzle-orm/pg-core';
import { createPostgresOAuthSchema } from './schema.js';

function expectEveryForeignKeyToCascade(
	schema: ReturnType<typeof createPostgresOAuthSchema>,
): void {
	for (const table of [
		schema.transactions,
		schema.codes,
		schema.accessTokens,
		schema.refreshTokens,
	]) {
		const foreignKeys = getTableConfig(table).foreignKeys;
		expect(foreignKeys.length).toBeGreaterThan(0);
		for (const foreignKey of foreignKeys) {
			expect(foreignKey.onDelete).toBe('cascade');
		}
	}

	const refreshAccessForeignKeys = getTableConfig(schema.refreshTokens).foreignKeys.filter(
		(foreignKey) => {
			const reference = foreignKey.reference();
			return (
				reference.columns[0]?.name === 'access_token_hash' &&
				reference.foreignColumns[0]?.name === 'access_token_hash'
			);
		},
	);
	expect(refreshAccessForeignKeys).toHaveLength(1);
	expect(refreshAccessForeignKeys[0]?.onDelete).toBe('cascade');
}

describe('createPostgresOAuthSchema foreign keys', () => {
	test('cascades every foreign key for UUID and integer host identifiers', () => {
		const uuidUsers = pgTable('postgres_oauth_uuid_users', { id: uuid('id').primaryKey() });
		const integerUsers = pgTable('postgres_oauth_integer_users', {
			id: serial('id').primaryKey(),
		});
		const uuidSchema = createPostgresOAuthSchema({
			prefix: 'postgres_oauth_uuid',
			userId: () =>
				uuid('user_id')
					.notNull()
					.references(() => uuidUsers.id, { onDelete: 'cascade' }),
		});
		const integerSchema = createPostgresOAuthSchema({
			prefix: 'postgres_oauth_integer',
			userId: () =>
				integer('user_id')
					.notNull()
					.references(() => integerUsers.id, { onDelete: 'cascade' }),
		});

		expectEveryForeignKeyToCascade(uuidSchema);
		expectEveryForeignKeyToCascade(integerSchema);
	});
});
