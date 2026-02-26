import { pgSchema, pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';

/**
 * Neon Auth users table — managed by Neon, referenced via foreign key.
 * This table is NOT migrated by Drizzle. It exists in the `neon_auth` schema.
 */
const neonAuthSchema = pgSchema('neon_auth');

export const neonAuthUsers = neonAuthSchema.table('users_sync', {
	id: uuid('id').primaryKey(),
	name: text('name'),
	email: text('email'),
	image: text('image'),
	createdAt: timestamp('created_at', { withTimezone: true }),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const oauthClients = pgTable('oauth_clients', {
	clientId: text('client_id').primaryKey(),
	clientSecret: text('client_secret').notNull(),
	clientName: text('client_name').notNull(),
	redirectUris: jsonb('redirect_uris').$type<string[]>().notNull().default([]),
	grantTypes: jsonb('grant_types').$type<string[]>().notNull().default([]),
	responseTypes: jsonb('response_types').$type<string[]>().notNull().default([]),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const oauthCodes = pgTable('oauth_codes', {
	code: text('code').primaryKey(),
	clientId: text('client_id')
		.notNull()
		.references(() => oauthClients.clientId),
	userId: uuid('user_id')
		.notNull()
		.references(() => neonAuthUsers.id),
	redirectUri: text('redirect_uri').notNull(),
	codeChallenge: text('code_challenge').notNull(),
	codeChallengeMethod: text('code_challenge_method').notNull().default('S256'),
	scope: text('scope').default(''),
	state: text('state'),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	usedAt: timestamp('used_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const oauthTokens = pgTable('oauth_tokens', {
	accessToken: text('access_token').primaryKey(),
	clientId: text('client_id')
		.notNull()
		.references(() => oauthClients.clientId),
	userId: uuid('user_id')
		.notNull()
		.references(() => neonAuthUsers.id),
	scope: text('scope').default(''),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	revokedAt: timestamp('revoked_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const mcpSessions = pgTable('mcp_sessions', {
	sessionId: text('session_id').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => neonAuthUsers.id),
	clientId: text('client_id').references(() => oauthClients.clientId),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
});
