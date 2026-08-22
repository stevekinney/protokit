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
