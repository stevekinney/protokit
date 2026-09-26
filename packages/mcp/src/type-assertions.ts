import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { createPostgresOAuthSchema, createPostgresOAuthStores } from './oauth/postgres/index.js';
import type { PostgresOAuthDatabase, PostgresOAuthSchema } from './oauth/postgres/index.js';
import { defineScopes } from './scope-vocabulary.js';
import type { McpRegistry } from './scope-vocabulary.js';

/**
 * Compile-time assertions for the consumer-vocabulary contract.
 *
 * These live in a non-test file deliberately: `tsconfig.json` excludes
 * `src/**\/*.test.ts` from `typecheck`, so a type-level guarantee asserted
 * only in a test file is never actually checked by the command that claims to
 * check types. This file is compiled by `bun run typecheck`.
 *
 * Every `@ts-expect-error` below is also its own fails-when-removed proof: if
 * the constraint it documents is loosened, the error it expects stops
 * occurring, the directive becomes unused, and `tsc` fails on the directive
 * itself. There is no way to relax the vocabulary binding and leave this file
 * passing.
 */

const consumerVocabulary = defineScopes({
	'repositories:read': 'Read repository metadata.',
	'conformance:read': 'Conformance fixtures only.',
});

const noopHandler = async () => ({ content: [] });

// A scope drawn from the vocabulary is accepted.
consumerVocabulary.defineTool({
	name: 'in_vocabulary',
	title: 'In vocabulary',
	description: 'Declares a scope this vocabulary contains.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	requiredScope: 'repositories:read',
	handler: noopHandler,
});

consumerVocabulary.defineTool({
	name: 'typo_scope',
	title: 'Typo scope',
	description: 'A mistyped scope must fail here, on the tool, not later at registry assignment.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	// @ts-expect-error - 'reposotories:read' is not in this vocabulary. An
	// unbound `defineTool` would infer `Scope` from this literal and accept
	// it; the bound definer is what puts the failure on the primitive's own
	// line.
	requiredScope: 'reposotories:read',
	handler: noopHandler,
});

consumerVocabulary.defineTool({
	name: 'wildcard_scope',
	title: 'Wildcard scope',
	description: 'An all-access scope must not be expressible.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	// @ts-expect-error - there is no wildcard member, so '*' is rejected the
	// same way any other non-member is. AUTHZ-001's "no generic all-access
	// scope" survives opening the vocabulary because membership is exact on
	// both sides.
	requiredScope: '*',
	handler: noopHandler,
});

// A scope from another vocabulary is not silently interchangeable.
const otherVocabulary = defineScopes({ 'unrelated:read': 'Something else entirely.' });

const crossVocabularyRegistry: McpRegistry<'repositories:read' | 'conformance:read'> = {
	tools: [],
	resources: [],
	prompts: [
		// @ts-expect-error - a prompt typed against a different vocabulary
		// cannot be registered here. Two consumers' vocabularies are distinct
		// types, not two aliases for `string`.
		otherVocabulary.definePrompt({
			name: 'foreign',
			title: 'Foreign',
			description: 'Declared against a different vocabulary.',
			arguments: undefined,
			requiredScope: 'unrelated:read',
			handler: async () => ({ messages: [] }),
		}),
	],
};

void crossVocabularyRegistry;

// `__proto__` is rejected where it is written. Without this, TypeScript would
// infer it as a scope while `Object.keys()` omitted it — a primitive requiring
// a scope the vocabulary cannot issue.
defineScopes({
	// @ts-expect-error - `__proto__` never becomes an own property in an object
	// literal, so it cannot be a scope name.
	__proto__: 'Read prototype metadata.',
	'repositories:read': 'Read repository metadata.',
});

// A registry built through the vocabulary stays pinned to it.
const boundRegistry = consumerVocabulary.defineRegistry({
	tools: [],
	resources: [],
	prompts: [
		// @ts-expect-error - a primitive from another vocabulary cannot enter a
		// registry built by this one, even though the registry is inferred
		// rather than hand-annotated.
		otherVocabulary.definePrompt({
			name: 'foreign-in-bound-registry',
			title: 'Foreign',
			description: 'Declared against a different vocabulary.',
			arguments: undefined,
			requiredScope: 'unrelated:read',
			handler: async () => ({ messages: [] }),
		}),
	],
});

void boundRegistry;

/**
 * A numerically-written scope must stay usable.
 *
 * `Object.keys()` stringifies keys, so `{ 123: '...' }` yields the runtime
 * scope `'123'`. If the type discarded the numeric literal the vocabulary
 * would be `McpScopeVocabulary<never>` and this `requiredScope` would not
 * compile — which is why the assertion belongs here rather than in a test
 * file. A runtime test cannot see it: the behaviour is identical either way,
 * because types do not exist at runtime. That test passes with the fix
 * absent, which is precisely the shape of defect this package keeps warning
 * about.
 */
const numericVocabulary = defineScopes({ 123: 'Read numbered data.' });

numericVocabulary.defineTool({
	name: 'numeric_scope_tool',
	title: 'Numeric scope',
	description: 'Declares a numerically-written scope.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	requiredScope: '123',
	handler: noopHandler,
});

/**
 * The Postgres OAuth factory must preserve a host-owned non-null integer user
 * identifier through `createPostgresOAuthStores()` without a consumer cast.
 * Test files are excluded from package typechecking, so this assertion lives
 * in the compiled fixture beside the other consumer-facing contracts.
 */
const integerOAuthUsers = pgTable('type_assertion_integer_oauth_users', {
	id: integer('id').primaryKey(),
});
const integerOAuthSchema = createPostgresOAuthSchema({
	prefix: 'type_assertion_integer_oauth',
	userId: () =>
		integer('user_id')
			.notNull()
			.references(() => integerOAuthUsers.id, { onDelete: 'cascade' }),
});
const typeAssertionPostgresDatabase: PostgresOAuthDatabase = {
	execute: async () => [],
	transaction: async (callback) => callback({ execute: async () => [] }),
};

createPostgresOAuthStores(typeAssertionPostgresDatabase, integerOAuthSchema);

const uuidOAuthUsers = pgTable('type_assertion_uuid_oauth_users', {
	id: uuid('id').primaryKey(),
});
const uuidOAuthSchema = createPostgresOAuthSchema({
	prefix: 'type_assertion_uuid_oauth',
	userId: () =>
		uuid('user_id')
			.notNull()
			.references(() => uuidOAuthUsers.id, { onDelete: 'cascade' }),
});

createPostgresOAuthStores(typeAssertionPostgresDatabase, uuidOAuthSchema);

const manualOAuthClients = pgTable('type_assertion_manual_oauth_clients', {
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
const manualOAuthTransactions = pgTable('type_assertion_manual_oauth_transactions', {
	transactionIdHash: text('transaction_id_hash').primaryKey(),
	csrfTokenHash: text('csrf_token_hash').notNull(),
	consentBindingHash: text('consent_binding_hash').notNull(),
	userId: text('user_id').notNull(),
	clientId: text('client_id').notNull(),
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
});
const manualOAuthCodes = pgTable('type_assertion_manual_oauth_codes', {
	codeHash: text('code_hash').primaryKey(),
	clientId: text('client_id').notNull(),
	userId: text('user_id').notNull(),
	redirectUri: text('redirect_uri').notNull(),
	codeChallenge: text('code_challenge').notNull(),
	codeChallengeMethod: text('code_challenge_method').notNull(),
	scope: text('scope'),
	state: text('state'),
	resource: text('resource').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	usedAt: timestamp('used_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
const manualOAuthAccessTokens = pgTable('type_assertion_manual_oauth_access_tokens', {
	accessTokenHash: text('access_token_hash').primaryKey(),
	clientId: text('client_id').notNull(),
	userId: text('user_id').notNull(),
	scope: text('scope'),
	resource: text('resource').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	revokedAt: timestamp('revoked_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
const manualOAuthRefreshTokens = pgTable('type_assertion_manual_oauth_refresh_tokens', {
	refreshTokenHash: text('refresh_token_hash').primaryKey(),
	clientId: text('client_id').notNull(),
	userId: text('user_id').notNull(),
	scope: text('scope'),
	resource: text('resource').notNull(),
	accessTokenHash: text('access_token_hash').notNull(),
	familyId: text('family_id').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	revokedAt: timestamp('revoked_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

const manualOAuthSchema: PostgresOAuthSchema = {
	clients: manualOAuthClients,
	transactions: manualOAuthTransactions,
	codes: manualOAuthCodes,
	accessTokens: manualOAuthAccessTokens,
	refreshTokens: manualOAuthRefreshTokens,
};

createPostgresOAuthStores(typeAssertionPostgresDatabase, manualOAuthSchema);

const incompleteOAuthClients = pgTable('type_assertion_incomplete_oauth_clients', {
	clientId: text('client_id').primaryKey(),
});
const integerClientNameOAuthClients = pgTable('type_assertion_integer_client_name_oauth_clients', {
	clientId: text('client_id').primaryKey(),
	clientSecretHash: text('client_secret_hash'),
	clientName: integer('client_name').notNull(),
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
const nullableClientNameOAuthClients = pgTable(
	'type_assertion_nullable_client_name_oauth_clients',
	{
		clientId: text('client_id').primaryKey(),
		clientSecretHash: text('client_secret_hash'),
		clientName: text('client_name'),
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
	},
);
const incompleteOAuthCodes = pgTable('type_assertion_incomplete_oauth_codes', {
	clientId: text('client_id').notNull(),
	userId: text('user_id').notNull(),
});

const incompleteClientsOAuthSchema: PostgresOAuthSchema = {
	// @ts-expect-error - a client table missing store-used columns must not satisfy the OAuth schema contract.
	clients: incompleteOAuthClients,
	transactions: manualOAuthTransactions,
	codes: manualOAuthCodes,
	accessTokens: manualOAuthAccessTokens,
	refreshTokens: manualOAuthRefreshTokens,
};

const integerClientNameOAuthSchema: PostgresOAuthSchema = {
	// @ts-expect-error - fixed client columns must preserve the factory data type, so clientName stays text.
	clients: integerClientNameOAuthClients,
	transactions: manualOAuthTransactions,
	codes: manualOAuthCodes,
	accessTokens: manualOAuthAccessTokens,
	refreshTokens: manualOAuthRefreshTokens,
};

const nullableClientNameOAuthSchema: PostgresOAuthSchema = {
	// @ts-expect-error - fixed client columns must preserve the factory nullability, so clientName stays non-null.
	clients: nullableClientNameOAuthClients,
	transactions: manualOAuthTransactions,
	codes: manualOAuthCodes,
	accessTokens: manualOAuthAccessTokens,
	refreshTokens: manualOAuthRefreshTokens,
};

const incompleteCodesOAuthSchema: PostgresOAuthSchema = {
	clients: manualOAuthClients,
	transactions: manualOAuthTransactions,
	// @ts-expect-error - non-client OAuth tables must retain every store-used fixed column, not only userId/clientId.
	codes: incompleteOAuthCodes,
	accessTokens: manualOAuthAccessTokens,
	refreshTokens: manualOAuthRefreshTokens,
};

void incompleteClientsOAuthSchema;
void integerClientNameOAuthSchema;
void nullableClientNameOAuthSchema;
void incompleteCodesOAuthSchema;
