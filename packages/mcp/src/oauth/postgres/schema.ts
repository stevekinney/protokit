import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	type PgColumnBuilderBase,
} from 'drizzle-orm/pg-core';

export type PostgresOAuthSchemaOptions<TUserId extends PgColumnBuilderBase> = {
	prefix: string;
	userId: () => TUserId;
};

/**
 * Defines the durable OAuth tables while leaving the host's user identifier
 * type and foreign-key target under host control.
 */
export function createPostgresOAuthSchema<TUserId extends PgColumnBuilderBase>({
	prefix,
	userId,
}: PostgresOAuthSchemaOptions<TUserId>) {
	const clients = pgTable(`${prefix}_clients`, {
		clientId: text('client_id').primaryKey(),
		clientSecretHash: text('client_secret_hash'),
		clientName: text('client_name').notNull(),
		clientType: text('client_type').notNull(),
		tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull(),
		applicationType: text('application_type'),
		redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
		grantTypes: jsonb('grant_types').$type<string[]>().notNull(),
		responseTypes: jsonb('response_types').$type<string[]>().notNull(),
		clientIdMetadataUrl: text('client_id_metadata_url'),
		clientSecretExpiresAt: timestamp('client_secret_expires_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
	});

	const transactions = pgTable(
		`${prefix}_authorization_transactions`,
		{
			transactionIdHash: text('transaction_id_hash').primaryKey(),
			csrfTokenHash: text('csrf_token_hash').notNull(),
			consentBindingHash: text('consent_binding_hash').notNull(),
			userId: userId(),
			clientId: text('client_id')
				.notNull()
				.references(() => clients.clientId, { onDelete: 'cascade' }),
			redirectUri: text('redirect_uri').notNull(),
			codeChallenge: text('code_challenge').notNull(),
			codeChallengeMethod: text('code_challenge_method').notNull(),
			state: text('state'),
			issuer: text('issuer').notNull(),
			resource: text('resource').notNull(),
			scope: text('scope').notNull(),
			expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
			consumedAt: timestamp('consumed_at', { withTimezone: true }),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		},
		(table) => [
			index(`${prefix}_transactions_binding_idx`).on(table.consentBindingHash),
			index(`${prefix}_transactions_user_idx`).on(table.userId),
			index(`${prefix}_transactions_expires_idx`).on(table.expiresAt),
		],
	);

	const codes = pgTable(
		`${prefix}_codes`,
		{
			codeHash: text('code_hash').primaryKey(),
			clientId: text('client_id')
				.notNull()
				.references(() => clients.clientId, { onDelete: 'cascade' }),
			userId: userId(),
			redirectUri: text('redirect_uri').notNull(),
			codeChallenge: text('code_challenge').notNull(),
			codeChallengeMethod: text('code_challenge_method').notNull(),
			scope: text('scope'),
			state: text('state'),
			resource: text('resource').notNull(),
			expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
			usedAt: timestamp('used_at', { withTimezone: true }),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		},
		(table) => [
			index(`${prefix}_codes_user_idx`).on(table.userId),
			index(`${prefix}_codes_expires_idx`).on(table.expiresAt),
		],
	);

	const accessTokens = pgTable(
		`${prefix}_access_tokens`,
		{
			accessTokenHash: text('access_token_hash').primaryKey(),
			clientId: text('client_id')
				.notNull()
				.references(() => clients.clientId, { onDelete: 'cascade' }),
			userId: userId(),
			scope: text('scope'),
			resource: text('resource').notNull(),
			expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
			revokedAt: timestamp('revoked_at', { withTimezone: true }),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		},
		(table) => [
			index(`${prefix}_access_user_idx`).on(table.userId),
			index(`${prefix}_access_expires_idx`).on(table.expiresAt),
		],
	);

	const refreshTokens = pgTable(
		`${prefix}_refresh_tokens`,
		{
			refreshTokenHash: text('refresh_token_hash').primaryKey(),
			clientId: text('client_id')
				.notNull()
				.references(() => clients.clientId, { onDelete: 'cascade' }),
			userId: userId(),
			scope: text('scope'),
			resource: text('resource').notNull(),
			accessTokenHash: text('access_token_hash')
				.notNull()
				.references(() => accessTokens.accessTokenHash, { onDelete: 'cascade' }),
			familyId: text('family_id').notNull(),
			expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
			revokedAt: timestamp('revoked_at', { withTimezone: true }),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		},
		(table) => [
			index(`${prefix}_refresh_user_idx`).on(table.userId),
			index(`${prefix}_refresh_family_idx`).on(table.familyId),
			index(`${prefix}_refresh_expires_idx`).on(table.expiresAt),
		],
	);

	return { clients, transactions, codes, accessTokens, refreshTokens };
}

export type PostgresOAuthSchema = ReturnType<typeof createPostgresOAuthSchema>;
