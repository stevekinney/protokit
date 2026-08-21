import { sql } from 'drizzle-orm';
import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
	uniqueIndex,
} from 'drizzle-orm/pg-core';

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

export const userSessions = pgTable(
	'user_sessions',
	{
		sessionTokenHash: text('session_token_hash').primaryKey(),
		/**
		 * DATA-001 / S-18: `onDelete: 'cascade'`. A browser session is
		 * worthless -- and actively dangerous -- without the account it
		 * authenticates; a session outliving its user is exactly the "orphaned
		 * credential" class this item exists to close, not a record worth
		 * preserving for audit (there is no audit-events table in this schema
		 * for it to feed).
		 */
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		// DATA-001: cleanup deletes by `expiresAt`/`revokedAt` in bounded
		// batches (`scheduled-cleanup.ts`); without an index that scan is a
		// full-table scan on every sweep.
		expiresAtIndex: index('user_sessions_expires_at_idx').on(table.expiresAt),
		revokedAtIndex: index('user_sessions_revoked_at_idx').on(table.revokedAt),
	}),
);

export const userGoogleAccounts = pgTable(
	'user_google_accounts',
	{
		googleSubject: text('google_subject').primaryKey(),
		// DATA-001 / S-18: `onDelete: 'cascade'` -- a linked Google identity has
		// no meaning independent of the account it authenticates into.
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
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
	/**
	 * OAUTH-002: nullable because a public client (`token_endpoint_auth_method:
	 * 'none'`) never has a secret to check — RFC 7591 §3.2.1 and the roadmap
	 * both require the server never issue one. A `none` client authenticates
	 * with PKCE alone; storing a fabricated secret here would be placeholder
	 * data with no check that ever reads it, which the project conventions
	 * forbid outright.
	 */
	clientSecret: text('client_secret'),
	clientName: text('client_name').notNull(),
	clientType: text('client_type').notNull().default('confidential'),
	tokenEndpointAuthMethod: text('token_endpoint_auth_method')
		.notNull()
		.default('client_secret_post'),
	/**
	 * OAUTH-002 / SEP-837: OpenID Connect Dynamic Client Registration's
	 * `application_type` ('web' | 'native'), stored when a registering client
	 * supplies it. Null means the client never specified one -- treated as
	 * "unspecified" everywhere, never silently coerced to a default, so a
	 * pre-existing row from before this column existed behaves exactly as it
	 * did before.
	 */
	applicationType: text('application_type'),
	redirectUris: jsonb('redirect_uris').$type<string[]>().notNull().default([]),
	grantTypes: jsonb('grant_types').$type<string[]>().notNull().default([]),
	responseTypes: jsonb('response_types').$type<string[]>().notNull().default([]),
	/**
	 * OAUTH-002: set only for a client registered through a Client ID
	 * Metadata Document (its `clientId` is the HTTPS URL the document was
	 * fetched from). Distinguishes a CIMD-backed row -- upserted from a
	 * document the client itself hosts, re-validated and refreshed on each
	 * successful fetch -- from a DCR row, which is created once and never
	 * re-derived from anywhere.
	 */
	clientIdMetadataUrl: text('client_id_metadata_url'),
	/**
	 * DATA-001 / S-18: a confidential client's secret's own expiry, set at
	 * issuance (`handleOauthRegisterPost`) and at rotation
	 * (`scripts/rotate-secret.ts`'s `rotateOauthClientSecret`) so "client
	 * secrets never expire" stops being true. Null for a public (`none`)
	 * client, which never has a secret to expire, and for any pre-existing
	 * row from before this column existed -- `authenticateOauthClient`
	 * treats null as "no expiry recorded" rather than "expired", so a
	 * legacy row is not silently locked out; every new or rotated secret
	 * gets a real value.
	 */
	clientSecretExpiresAt: timestamp('client_secret_expires_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const oauthCodes = pgTable(
	'oauth_codes',
	{
		code: text('code').primaryKey(),
		// DATA-001 / S-18: `onDelete: 'cascade'` on both FKs below -- an
		// authorization code is a short-lived credential artifact with no
		// standalone meaning once either the client or the user it was issued
		// for is gone.
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		redirectUri: text('redirect_uri').notNull(),
		codeChallenge: text('code_challenge').notNull(),
		codeChallengeMethod: text('code_challenge_method').notNull().default('S256'),
		scope: text('scope').default(''),
		state: text('state'),
		/**
		 * OAUTH-001 / RFC 8707: the canonical MCP resource URL this authorization
		 * code was issued for, copied from the authorization transaction that
		 * produced it. The token endpoint must echo the same value back and
		 * copies it onto the minted access/refresh tokens below, so the audience
		 * a token is valid for is never inferred — only ever carried forward
		 * from the one place it was originally validated.
		 */
		resource: text('resource').notNull().default(''),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		usedAt: timestamp('used_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		expiresAtIndex: index('oauth_codes_expires_at_idx').on(table.expiresAt),
	}),
);

export const oauthTokens = pgTable(
	'oauth_tokens',
	{
		accessToken: text('access_token').primaryKey(),
		// DATA-001 / S-18: `onDelete: 'cascade'` on both FKs -- an access token
		// is a pure credential artifact; it authorizes nothing once the client
		// or the user it was minted for is gone.
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		scope: text('scope').default(''),
		/** OAUTH-001 / RFC 8707: the resource audience this access token is valid for. `/mcp` rejects any token whose stored value does not exactly match the canonical MCP resource URL. */
		resource: text('resource').notNull().default(''),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		expiresAtIndex: index('oauth_tokens_expires_at_idx').on(table.expiresAt),
		revokedAtIndex: index('oauth_tokens_revoked_at_idx').on(table.revokedAt),
		userIdIndex: index('oauth_tokens_user_id_idx').on(table.userId),
	}),
);

/**
 * A short-lived, single-use server-side record of one browser authorization
 * consent screen (SEC-005 / S-09). Created when `/oauth/authorize` renders
 * the consent page and consumed atomically by approve/deny — the browser
 * form only ever carries the opaque `transactionId` and a one-time
 * `csrfToken`; every authoritative value (client, redirect URI, PKCE
 * challenge, state, issuer) is reloaded from this row, never from the form.
 */
export const oauthAuthorizationTransactions = pgTable(
	'oauth_authorization_transactions',
	{
		transactionId: text('transaction_id').primaryKey(),
		csrfTokenHash: text('csrf_token_hash').notNull(),
		// DATA-001 / S-18: `onDelete: 'cascade'` on both FKs -- a consent
		// transaction is a short-lived, single-use record with no meaning once
		// either the user or the client it names is gone.
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		sessionTokenHash: text('session_token_hash').notNull(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: 'cascade' }),
		redirectUri: text('redirect_uri').notNull(),
		codeChallenge: text('code_challenge').notNull(),
		codeChallengeMethod: text('code_challenge_method').notNull().default('S256'),
		state: text('state'),
		issuer: text('issuer').notNull(),
		/**
		 * OAUTH-001 / RFC 8707: the canonical MCP resource URL the browser
		 * authorization request named, validated against `getMcpResourceUrl`
		 * before the consent page ever renders. Copied onto the authorization
		 * code approve mints, and from there onto the issued tokens.
		 */
		resource: text('resource').notNull().default(''),
		/**
		 * AUTHZ-001: the canonical, space-delimited, sorted scope string this
		 * consent screen actually displayed to the user -- either the client's
		 * explicit `scope` request (narrowed to a subset of the scopes this
		 * server supports) or, when the request named none, the full supported
		 * set (RFC 6749 §3.3's "pre-defined default"). Copied onto the
		 * authorization code approve mints, and from there onto the issued
		 * tokens, so a granted scope is always traceable back to the exact
		 * transaction a human approved -- never re-derived or trusted from a
		 * form field.
		 */
		scope: text('scope').notNull().default(''),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		consumedAt: timestamp('consumed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		expiresAtIndex: index('oauth_authorization_transactions_expires_at_idx').on(table.expiresAt),
	}),
);

export const oauthRefreshTokens = pgTable(
	'oauth_refresh_tokens',
	{
		refreshToken: text('refresh_token').primaryKey(),
		// DATA-001 / S-18: `onDelete: 'cascade'` on both FKs -- a refresh
		// token, like an access token, has no meaning once the client or
		// user it was minted for is gone.
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		scope: text('scope').default(''),
		/** OAUTH-001 / RFC 8707: the resource audience carried forward onto every access token minted from this refresh token. */
		resource: text('resource').notNull().default(''),
		accessTokenHash: text('access_token_hash').notNull(),
		/**
		 * OAUTH-003: constant across every refresh token descended from one
		 * authorization-code exchange, carried forward unchanged on each
		 * rotation. Lets a replay of an already-rotated refresh token revoke
		 * the whole lineage rather than only the one reused row, and gives
		 * `SEC-003`'s rate limiter a token-family key to layer abuse controls
		 * on later, which it could not do before this column existed. The
		 * `gen_random_uuid()` default (Postgres 13+ core, no extension) exists
		 * only so `ALTER TABLE ADD COLUMN` is safe against pre-existing rows —
		 * each backfills into its own singleton family rather than sharing one
		 * value, which would make one replay of any legacy token revoke every
		 * other legacy token as collateral damage. Application code always
		 * supplies a real value explicitly; the default is never relied on by
		 * any code path.
		 */
		familyId: text('family_id')
			.notNull()
			.default(sql`gen_random_uuid()`),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		familyIdIndex: index('oauth_refresh_tokens_family_id_idx').on(table.familyId),
		expiresAtIndex: index('oauth_refresh_tokens_expires_at_idx').on(table.expiresAt),
		revokedAtIndex: index('oauth_refresh_tokens_revoked_at_idx').on(table.revokedAt),
		userIdIndex: index('oauth_refresh_tokens_user_id_idx').on(table.userId),
	}),
);
