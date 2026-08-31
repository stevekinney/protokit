import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { integer, pgTable, serial, text, uuid } from 'drizzle-orm/pg-core';
import { runOAuthStoreConformance } from '../../testing/oauth-store-conformance.js';
import type { AccessToken, RefreshToken, RegisteredClient } from '../stores.js';
import { createPostgresOAuthSchema, createPostgresOAuthStores } from './index.js';

describe('createPostgresOAuthSchema', () => {
	test('accepts host-owned UUID and integer user identifiers', () => {
		const uuidUsers = pgTable('postgres_oauth_uuid_users', { id: uuid('id').primaryKey() });
		const integerUsers = pgTable('postgres_oauth_integer_users', { id: serial('id').primaryKey() });
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
		expect(uuidSchema.codes.userId.dataType).toBe('string');
		expect(integerSchema.codes.userId.dataType).toBe('number');
	});
});

const connection = new Pool({ connectionString: process.env.DATABASE_URL });
const database = drizzle(connection);
const users = pgTable('mcp_postgres_test_users', { id: text('id').primaryKey() });
const schema = createPostgresOAuthSchema({
	prefix: 'mcp_postgres_test',
	userId: () =>
		text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
});

const setup = (async () => {
	await connection.query(`
		DROP TABLE IF EXISTS mcp_postgres_test_refresh_tokens, mcp_postgres_test_access_tokens, mcp_postgres_test_codes, mcp_postgres_test_authorization_transactions, mcp_postgres_test_clients, mcp_postgres_test_users CASCADE;
		CREATE TABLE IF NOT EXISTS mcp_postgres_test_users (id text PRIMARY KEY);
		CREATE TABLE IF NOT EXISTS mcp_postgres_test_clients (client_id text PRIMARY KEY, client_secret_hash text, client_name text NOT NULL, client_type text NOT NULL, token_endpoint_auth_method text NOT NULL, application_type text, redirect_uris jsonb NOT NULL, grant_types jsonb NOT NULL, response_types jsonb NOT NULL, client_id_metadata_url text, client_secret_expires_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
		CREATE TABLE IF NOT EXISTS mcp_postgres_test_authorization_transactions (transaction_id_hash text PRIMARY KEY, csrf_token_hash text NOT NULL, consent_binding_hash text NOT NULL, user_id text NOT NULL REFERENCES mcp_postgres_test_users(id) ON DELETE CASCADE, client_id text NOT NULL REFERENCES mcp_postgres_test_clients(client_id) ON DELETE CASCADE, redirect_uri text NOT NULL, code_challenge text NOT NULL, code_challenge_method text NOT NULL, state text, issuer text NOT NULL, resource text NOT NULL, scope text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL);
		CREATE TABLE IF NOT EXISTS mcp_postgres_test_codes (code_hash text PRIMARY KEY, client_id text NOT NULL REFERENCES mcp_postgres_test_clients(client_id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES mcp_postgres_test_users(id) ON DELETE CASCADE, redirect_uri text NOT NULL, code_challenge text NOT NULL, code_challenge_method text NOT NULL, scope text, state text, resource text NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL);
		CREATE TABLE IF NOT EXISTS mcp_postgres_test_access_tokens (access_token_hash text PRIMARY KEY, client_id text NOT NULL REFERENCES mcp_postgres_test_clients(client_id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES mcp_postgres_test_users(id) ON DELETE CASCADE, scope text, resource text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL);
		CREATE TABLE IF NOT EXISTS mcp_postgres_test_refresh_tokens (refresh_token_hash text PRIMARY KEY, client_id text NOT NULL REFERENCES mcp_postgres_test_clients(client_id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES mcp_postgres_test_users(id) ON DELETE CASCADE, scope text, resource text NOT NULL, access_token_hash text NOT NULL REFERENCES mcp_postgres_test_access_tokens(access_token_hash), family_id text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL);
	`);
})();

beforeAll(async () => setup);
afterAll(async () => {
	await connection.query(
		'DROP TABLE IF EXISTS mcp_postgres_test_refresh_tokens, mcp_postgres_test_access_tokens, mcp_postgres_test_codes, mcp_postgres_test_authorization_transactions, mcp_postgres_test_clients, mcp_postgres_test_users CASCADE',
	);
	await connection.end();
});

async function resetFixture(): Promise<void> {
	await setup;
	await connection.query(
		'TRUNCATE mcp_postgres_test_refresh_tokens, mcp_postgres_test_access_tokens, mcp_postgres_test_codes, mcp_postgres_test_authorization_transactions, mcp_postgres_test_clients, mcp_postgres_test_users CASCADE',
	);
	await connection.query(
		"INSERT INTO mcp_postgres_test_users (id) VALUES ('user-one'), ('user-two')",
	);
}

async function seedClient(): Promise<void> {
	await connection.query(
		`INSERT INTO mcp_postgres_test_clients (client_id, client_secret_hash, client_name, client_type, token_endpoint_auth_method, application_type, redirect_uris, grant_types, response_types, client_id_metadata_url, client_secret_expires_at, created_at, updated_at) VALUES ('client-one', 'secret-hash', 'Seed Client', 'confidential', 'client_secret_post', 'web', '["https://client.example/callback"]'::jsonb, '["authorization_code"]'::jsonb, '["code"]'::jsonb, NULL, NULL, now(), now()) ON CONFLICT DO NOTHING`,
	);
}

function tokenRecord(accessTokenHash: string, expiresAt: Date): AccessToken {
	return {
		accessTokenHash,
		clientId: 'client-one',
		userId: 'user-one',
		scope: '',
		resource: 'resource',
		expiresAt,
		revokedAt: null,
		createdAt: new Date('2026-01-01'),
	};
}

function refreshRecord(
	refreshTokenHash: string,
	accessTokenHash: string,
	expiresAt: Date,
	familyId = 'family-one',
): RefreshToken {
	return {
		refreshTokenHash,
		clientId: 'client-one',
		userId: 'user-one',
		scope: '',
		resource: 'resource',
		accessTokenHash,
		familyId,
		expiresAt,
		revokedAt: null,
		createdAt: new Date('2026-01-01'),
	};
}

function rotation(
	priorHash: string,
	nextAccessTokenHash: string,
	nextRefreshTokenHash: string,
	createdAt: Date,
) {
	return {
		priorHash,
		clientId: 'client-one',
		resource: 'resource',
		nextAccessTokenHash,
		nextRefreshTokenHash,
		accessTokenExpiresAt: new Date('2099-01-01'),
		refreshTokenExpiresAt: new Date('2099-01-01'),
		createdAt,
	};
}

function clientRecord(): RegisteredClient {
	return {
		clientId: 'client-one',
		clientSecretHash: 'old',
		clientName: 'Old',
		clientType: 'confidential',
		tokenEndpointAuthMethod: 'client_secret_post',
		applicationType: 'web',
		redirectUris: [],
		grantTypes: [],
		responseTypes: [],
		clientIdMetadataUrl: null,
		clientSecretExpiresAt: null,
		createdAt: new Date('2026-01-01'),
		updatedAt: new Date('2026-01-01'),
	};
}

runOAuthStoreConformance('postgres', async () => {
	await resetFixture();
	const stores = createPostgresOAuthStores(database, schema);
	let placeholderClient = false;
	const ensureClient = async () => {
		const result = await connection.query(
			`INSERT INTO mcp_postgres_test_clients (client_id, client_secret_hash, client_name, client_type, token_endpoint_auth_method, application_type, redirect_uris, grant_types, response_types, client_id_metadata_url, client_secret_expires_at, created_at, updated_at) VALUES ('client-one', 'secret-hash', 'Seed Client', 'confidential', 'client_secret_post', 'web', '["https://client.example/callback"]'::jsonb, '["authorization_code"]'::jsonb, '["code"]'::jsonb, NULL, NULL, now(), now()) ON CONFLICT DO NOTHING`,
		);
		placeholderClient ||= result.rowCount === 1;
	};
	const createTransaction = stores.transactions.create.bind(stores.transactions);
	stores.transactions.create = async (input) => {
		await ensureClient();
		return createTransaction(input);
	};
	const issueCode = stores.codes.issue.bind(stores.codes);
	stores.codes.issue = async (record) => {
		await ensureClient();
		return issueCode(record);
	};
	const issueGrant = stores.tokens.issueAuthorizationGrant.bind(stores.tokens);
	stores.tokens.issueAuthorizationGrant = async (input) => {
		await ensureClient();
		return issueGrant(input);
	};
	const registerClient = stores.clients.register.bind(stores.clients);
	stores.clients.register = async (record) => {
		if (placeholderClient) {
			placeholderClient = false;
			return stores.clients.upsert(record);
		}
		return registerClient(record);
	};
	return stores;
});

describe('Postgres OAuth durability', () => {
	test('preserves an expired access token while its paired refresh token is live', async () => {
		await resetFixture();
		await seedClient();
		const stores = createPostgresOAuthStores(database, schema);
		await stores.tokens.issueAuthorizationGrant({
			accessToken: tokenRecord('short-access', new Date('2026-01-01')),
			refreshToken: refreshRecord('long-refresh', 'short-access', new Date('2027-01-01')),
		});
		expect(await stores.tokens.purgeExpired(new Date('2026-06-01'))).toBe(0);
		expect(await stores.tokens.findByHash('short-access')).not.toBeNull();
		expect(await stores.tokens.purgeExpired(new Date('2028-01-01'))).toBe(2);
	});

	test('returns Date values and ignores replay after the ancestor expires', async () => {
		await resetFixture();
		await seedClient();
		const stores = createPostgresOAuthStores(database, schema);
		await stores.tokens.issueAuthorizationGrant({
			accessToken: tokenRecord('access-one', new Date('2099-01-01')),
			refreshToken: refreshRecord('refresh-one', 'access-one', new Date('2099-01-01')),
		});
		const rotated = await stores.tokens.rotateRefreshToken(
			rotation('refresh-one', 'access-two', 'refresh-two', new Date('2026-01-02')),
		);
		expect(rotated.status).toBe('rotated');
		if (rotated.status !== 'rotated') throw new Error('Expected rotation');
		expect(rotated.accessToken.expiresAt).toBeInstanceOf(Date);
		expect(rotated.refreshToken.createdAt).toBeInstanceOf(Date);
		await connection.query(
			"UPDATE mcp_postgres_test_refresh_tokens SET expires_at = '2026-01-03' WHERE refresh_token_hash = 'refresh-one'",
		);
		expect(
			await stores.tokens.rotateRefreshToken(
				rotation('refresh-one', 'access-three', 'refresh-three', new Date('2026-01-04')),
			),
		).toEqual({ status: 'invalid' });
		expect((await stores.tokens.findByHash('access-two'))?.revokedAt).toBeNull();
	});

	test('applies concurrent client patches and avoids repeat family writes', async () => {
		await resetFixture();
		const stores = createPostgresOAuthStores(database, schema);
		await stores.clients.register(clientRecord());
		await Promise.all([
			stores.clients.update('client-one', { clientName: 'New' }),
			stores.clients.update('client-one', { clientSecretHash: 'rotated' }),
		]);
		expect(await stores.clients.findById('client-one')).toMatchObject({
			clientName: 'New',
			clientSecretHash: 'rotated',
		});
		await stores.tokens.issueAuthorizationGrant({
			accessToken: tokenRecord('access', new Date('2099-01-01')),
			refreshToken: refreshRecord('refresh', 'access', new Date('2099-01-01'), 'family'),
		});
		expect(await stores.tokens.revokeFamily('family')).toBe(2);
		expect(await stores.tokens.revokeFamily('family')).toBe(0);
	});
	test.each([
		['uuid', 'uuid', `'00000000-0000-4000-8000-000000000001'`],
		['integer', 'integer', '1'],
	] as const)(
		'host user deletion cascades through every %s OAuth table but preserves clients',
		async (suffix, userType, userValue) => {
			const prefix = `mcp_cascade_${suffix}`;
			try {
				await connection.query(`
				CREATE TABLE ${prefix}_users (id ${userType} PRIMARY KEY);
				CREATE TABLE ${prefix}_clients (client_id text PRIMARY KEY);
				CREATE TABLE ${prefix}_authorization_transactions (id text PRIMARY KEY, user_id ${userType} NOT NULL REFERENCES ${prefix}_users(id) ON DELETE CASCADE);
				CREATE TABLE ${prefix}_codes (id text PRIMARY KEY, user_id ${userType} NOT NULL REFERENCES ${prefix}_users(id) ON DELETE CASCADE);
				CREATE TABLE ${prefix}_access_tokens (id text PRIMARY KEY, user_id ${userType} NOT NULL REFERENCES ${prefix}_users(id) ON DELETE CASCADE);
				CREATE TABLE ${prefix}_refresh_tokens (id text PRIMARY KEY, user_id ${userType} NOT NULL REFERENCES ${prefix}_users(id) ON DELETE CASCADE);
				INSERT INTO ${prefix}_users VALUES (${userValue});
				INSERT INTO ${prefix}_clients VALUES ('client');
				INSERT INTO ${prefix}_authorization_transactions VALUES ('transaction', ${userValue});
				INSERT INTO ${prefix}_codes VALUES ('code', ${userValue});
				INSERT INTO ${prefix}_access_tokens VALUES ('access', ${userValue});
				INSERT INTO ${prefix}_refresh_tokens VALUES ('refresh', ${userValue});
				DELETE FROM ${prefix}_users WHERE id = ${userValue};
			`);
				const result = await connection.query(`SELECT
				(SELECT count(*) FROM ${prefix}_authorization_transactions) AS transactions,
				(SELECT count(*) FROM ${prefix}_codes) AS codes,
				(SELECT count(*) FROM ${prefix}_access_tokens) AS access_tokens,
				(SELECT count(*) FROM ${prefix}_refresh_tokens) AS refresh_tokens,
				(SELECT count(*) FROM ${prefix}_clients) AS clients`);
				expect(result.rows[0]).toEqual({
					transactions: '0',
					codes: '0',
					access_tokens: '0',
					refresh_tokens: '0',
					clients: '1',
				});
			} finally {
				await connection.query(
					`DROP TABLE IF EXISTS ${prefix}_refresh_tokens, ${prefix}_access_tokens, ${prefix}_codes, ${prefix}_authorization_transactions, ${prefix}_clients, ${prefix}_users CASCADE`,
				);
			}
		},
	);

	test('purges at least 1,000 rows from every OAuth credential table', async () => {
		await setup;
		await connection.query(
			'TRUNCATE mcp_postgres_test_refresh_tokens, mcp_postgres_test_access_tokens, mcp_postgres_test_codes, mcp_postgres_test_authorization_transactions, mcp_postgres_test_clients, mcp_postgres_test_users CASCADE',
		);
		await connection.query(
			"INSERT INTO mcp_postgres_test_users VALUES ('scale-user'); INSERT INTO mcp_postgres_test_clients (client_id, client_name, client_type, token_endpoint_auth_method, redirect_uris, grant_types, response_types, created_at, updated_at) VALUES ('scale-client', 'Scale', 'public', 'none', '[]', '[]', '[]', now(), now())",
		);
		await connection.query(`
			INSERT INTO mcp_postgres_test_authorization_transactions SELECT 'transaction-' || value, 'csrf', 'binding', 'scale-user', 'scale-client', 'https://example.test', 'challenge', 'S256', NULL, 'https://issuer.test', 'https://resource.test', '', now() - interval '1 hour', NULL, now() FROM generate_series(1, 1000) value;
			INSERT INTO mcp_postgres_test_codes SELECT 'code-' || value, 'scale-client', 'scale-user', 'https://example.test', 'challenge', 'S256', '', NULL, 'https://resource.test', now() - interval '1 hour', NULL, now() FROM generate_series(1, 1000) value;
			INSERT INTO mcp_postgres_test_access_tokens SELECT 'access-' || value, 'scale-client', 'scale-user', '', 'https://resource.test', now() - interval '1 hour', NULL, now() FROM generate_series(1, 1000) value;
			INSERT INTO mcp_postgres_test_refresh_tokens SELECT 'refresh-' || value, 'scale-client', 'scale-user', '', 'https://resource.test', 'access-' || value, 'family-' || value, now() - interval '1 hour', NULL, now() FROM generate_series(1, 1000) value;
		`);
		const stores = createPostgresOAuthStores(database, schema);
		expect(await stores.transactions.purgeExpired(new Date())).toBe(1000);
		expect(await stores.codes.purgeExpired(new Date())).toBe(1000);
		expect(await stores.tokens.purgeExpired(new Date())).toBe(2000);
	});
});
