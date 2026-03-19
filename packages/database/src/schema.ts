import { boolean, jsonb, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
	'users',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		email: text('email').notNull(),
		name: text('name').notNull(),
		image: text('image'),
		emailVerified: boolean('email_verified').notNull().default(false),
		role: text('role').notNull().default('user'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		emailUniqueIndex: uniqueIndex('users_email_unique').on(table.email),
	}),
);

export const userSessions = pgTable('user_sessions', {
	sessionTokenHash: text('session_token_hash').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	revokedAt: timestamp('revoked_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userGoogleAccounts = pgTable(
	'user_google_accounts',
	{
		googleSubject: text('google_subject').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id),
		email: text('email').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		userIdUniqueIndex: uniqueIndex('user_google_accounts_user_id_unique').on(table.userId),
	}),
);

export const oauthClients = pgTable('oauth_clients', {
	clientId: text('client_id').primaryKey(),
	clientSecret: text('client_secret').notNull(),
	clientName: text('client_name').notNull(),
	clientType: text('client_type').notNull().default('confidential'),
	tokenEndpointAuthMethod: text('token_endpoint_auth_method')
		.notNull()
		.default('client_secret_post'),
	serviceAccountUserId: uuid('service_account_user_id').references(() => users.id),
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
		.references(() => users.id),
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
		.references(() => users.id),
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
		.references(() => users.id),
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
		.references(() => users.id),
	clientId: text('client_id').references(() => oauthClients.clientId),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
});
