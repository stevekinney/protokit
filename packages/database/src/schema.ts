import { boolean, pgSchema, pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';

/**
 * Neon Auth tables — managed by Neon, referenced via foreign key.
 * These tables are NOT migrated by Drizzle. They exist in the `neon_auth` schema
 * and are provisioned when Neon Auth is enabled in the Neon Console.
 */
const neonAuthSchema = pgSchema('neon_auth');

export const neonAuthUsers = neonAuthSchema.table('user', {
	id: uuid('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	emailVerified: boolean('emailVerified').notNull(),
	image: text('image'),
	createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
	role: text('role'),
	banned: boolean('banned'),
	banReason: text('banReason'),
	banExpires: timestamp('banExpires', { withTimezone: true }),
});

export const neonAuthSessions = neonAuthSchema.table('session', {
	id: uuid('id').primaryKey(),
	expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	userId: uuid('userId')
		.notNull()
		.references(() => neonAuthUsers.id),
	impersonatedBy: text('impersonatedBy'),
	activeOrganizationId: text('activeOrganizationId'),
});

export const neonAuthAccounts = neonAuthSchema.table('account', {
	id: uuid('id').primaryKey(),
	accountId: text('accountId').notNull(),
	providerId: text('providerId').notNull(),
	userId: uuid('userId')
		.notNull()
		.references(() => neonAuthUsers.id),
	accessToken: text('accessToken'),
	refreshToken: text('refreshToken'),
	idToken: text('idToken'),
	accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const neonAuthVerifications = neonAuthSchema.table('verification', {
	id: uuid('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
	createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const oauthClients = pgTable('oauth_clients', {
	clientId: text('client_id').primaryKey(),
	clientSecret: text('client_secret').notNull(),
	clientName: text('client_name').notNull(),
	clientType: text('client_type').notNull().default('confidential'),
	tokenEndpointAuthMethod: text('token_endpoint_auth_method')
		.notNull()
		.default('client_secret_post'),
	serviceAccountUserId: uuid('service_account_user_id').references(() => neonAuthUsers.id),
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

export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
	refreshToken: text('refresh_token').primaryKey(),
	clientId: text('client_id')
		.notNull()
		.references(() => oauthClients.clientId),
	userId: uuid('user_id')
		.notNull()
		.references(() => neonAuthUsers.id),
	scope: text('scope').default(''),
	accessTokenHash: text('access_token_hash').notNull(),
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
