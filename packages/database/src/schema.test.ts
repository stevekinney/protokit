import { describe, it, expect } from 'bun:test';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from './schema';

describe('database schema exports', () => {
	it('exports users', () => {
		expect(schema.users).toBeDefined();
	});

	it('exports userSessions', () => {
		expect(schema.userSessions).toBeDefined();
	});

	it('exports userGoogleAccounts', () => {
		expect(schema.userGoogleAccounts).toBeDefined();
	});

	it('exports oauthClients', () => {
		expect(schema.oauthClients).toBeDefined();
	});

	it('exports oauthCodes', () => {
		expect(schema.oauthCodes).toBeDefined();
	});

	it('exports oauthTokens', () => {
		expect(schema.oauthTokens).toBeDefined();
	});
});

/**
 * DATA-001 / S-18: "database foreign keys do not specify whether identity
 * deletion restricts or cascades into sessions, grants, tokens, and MCP
 * records" -- every foreign key in this schema now declares `onDelete:
 * 'cascade'` deliberately (a session, code, token, refresh token, or
 * consent transaction has no meaning independent of the user or client it
 * references, and this schema has no audit-events table for a "preserve on
 * delete" case to apply to). Asserted directly against the generated table
 * config rather than the SQL migration text, so a future column edit that
 * drops the option is caught by `bun test packages/database`, not only by
 * reading a migration file nobody re-reads.
 */
/**
 * `users` is the one table whose extra-config callback (`(table) => ({...})`
 * declaring `emailUniqueIndex`) was never invoked by any existing test --
 * `getTableConfig` is what drizzle-orm calls internally to lazily evaluate
 * that callback, and no prior test in this package called it against
 * `schema.users` specifically.
 */
describe('users table indexes', () => {
	it('declares a unique index on email', () => {
		const config = getTableConfig(schema.users);
		const emailIndex = config.indexes.find((candidate) =>
			candidate.config.columns.some((column) => column.name === 'email'),
		);
		expect(emailIndex).toBeDefined();
		expect(emailIndex?.config.unique).toBe(true);
	});
});

describe('onDelete cascade behavior', () => {
	it.each([
		{ table: schema.userSessions, name: 'user_sessions' },
		{ table: schema.userGoogleAccounts, name: 'user_google_accounts' },
		{ table: schema.oauthCodes, name: 'oauth_codes' },
		{ table: schema.oauthTokens, name: 'oauth_tokens' },
		{ table: schema.oauthAuthorizationTransactions, name: 'oauth_authorization_transactions' },
		{ table: schema.oauthRefreshTokens, name: 'oauth_refresh_tokens' },
	])('every foreign key on $name cascades on delete', ({ table }) => {
		const config = getTableConfig(table);
		expect(config.foreignKeys.length).toBeGreaterThan(0);
		for (const foreignKey of config.foreignKeys) {
			expect(foreignKey.onDelete).toBe('cascade');
		}
	});

	it('oauthClients declares no user-referencing foreign key (client registrations are not user-owned)', () => {
		const config = getTableConfig(schema.oauthClients);
		expect(config.foreignKeys).toHaveLength(0);
	});
});

/**
 * DATA-001 review (R6): `scheduled-cleanup.ts` sweeps `oauth_codes` and
 * `oauth_authorization_transactions` with `expires_at < now OR used_at/consumed_at IS NOT
 * NULL`. Before this test, only the `expires_at` branch was indexed -- Postgres had no way to
 * satisfy the second branch without a sequential scan as either table grows. Asserted here
 * against the generated table config (a real `getTableConfig` partial-index `where` clause),
 * not merely that a migration file mentions the column, so a future edit that silently drops
 * the index or its `where` clause is caught by `bun test packages/database`.
 */
describe('cleanup predicate index coverage', () => {
	it.each([
		{ table: schema.oauthCodes, name: 'oauth_codes', indexedColumn: 'used_at' },
		{
			table: schema.oauthAuthorizationTransactions,
			name: 'oauth_authorization_transactions',
			indexedColumn: 'consumed_at',
		},
	])(
		'$name has a partial index on its cleanup-relevant nullable timestamp column',
		({ table, indexedColumn }) => {
			const config = getTableConfig(table);
			const index = config.indexes.find((candidate) =>
				candidate.config.columns.some((column) => column.name === indexedColumn),
			);
			expect(index).toBeDefined();
			// A partial index (`WHERE ... IS NOT NULL`) rather than a plain index over every
			// row -- most rows never populate this column, so indexing only the populated ones
			// keeps the index small as the table grows instead of duplicating `expires_at`'s
			// full-table coverage.
			expect(index?.config.where).toBeDefined();
		},
	);
});
