import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';
import { runScheduledCleanup } from '@web/lib/scheduled-cleanup';
import { deleteTestAccounts } from '@web/test-support/delete-test-accounts';

/**
 * `scheduled-cleanup.integration.test.ts` only seeds `user_sessions`, and
 * `scheduled-cleanup-compensation-retention.integration.test.ts` deliberately
 * seeds rows that must SURVIVE a sweep (still within their `expiresAt`
 * retention window). Neither exercises the actual `deleteByIds` statement
 * for `oauth_codes`, `oauth_refresh_tokens`, or `oauth_authorization_transactions`
 * -- this file does, by seeding one genuinely expired row per table and
 * proving `runScheduledCleanup` actually deletes it.
 */
const testRunId = randomUUID();
const userId = randomUUID();
const clientId = `scheduled-cleanup-deletion-coverage-${testRunId}`;
const expiredTimestamp = new Date(Date.now() - 60_000);

beforeAll(async () => {
	await database.insert(schema.users).values({
		id: userId,
		email: `${clientId}@example.com`,
		name: 'Scheduled Cleanup Deletion Coverage Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: hashCredential('test-client-secret'),
		clientName: 'Scheduled Cleanup Deletion Coverage Test Client',
		clientType: 'confidential',
		tokenEndpointAuthMethod: 'client_secret_post',
		redirectUris: ['https://example.com/callback'],
		grantTypes: ['authorization_code', 'refresh_token'],
		responseTypes: ['code'],
	});
});

afterAll(async () => {
	await deleteTestAccounts({ clientIds: [clientId], userIds: [userId] });
});

describe('runScheduledCleanup actually deletes expired rows in every table', () => {
	it('deletes an expired oauth_codes row', async () => {
		const codeHash = hashCredential(`deletion-coverage-code-${testRunId}`);
		await database.insert(schema.oauthCodes).values({
			code: codeHash,
			clientId,
			userId,
			redirectUri: 'https://example.com/callback',
			codeChallenge: 'challenge',
			codeChallengeMethod: 'S256',
			expiresAt: expiredTimestamp,
		});

		await runScheduledCleanup({ batchSize: 500, maxIterationsPerTable: 20 });

		const remaining = await database
			.select()
			.from(schema.oauthCodes)
			.where(eq(schema.oauthCodes.code, codeHash));
		expect(remaining).toHaveLength(0);
	});

	it('deletes an expired oauth_tokens row', async () => {
		const accessTokenHash = hashCredential(`deletion-coverage-token-${testRunId}`);
		await database.insert(schema.oauthTokens).values({
			accessToken: accessTokenHash,
			clientId,
			userId,
			expiresAt: expiredTimestamp,
		});

		await runScheduledCleanup({ batchSize: 500, maxIterationsPerTable: 20 });

		const remaining = await database
			.select()
			.from(schema.oauthTokens)
			.where(eq(schema.oauthTokens.accessToken, accessTokenHash));
		expect(remaining).toHaveLength(0);
	});

	it('deletes an expired oauth_refresh_tokens row', async () => {
		const refreshTokenHash = hashCredential(`deletion-coverage-refresh-${testRunId}`);
		await database.insert(schema.oauthRefreshTokens).values({
			refreshToken: refreshTokenHash,
			clientId,
			userId,
			accessTokenHash: hashCredential(`deletion-coverage-access-${testRunId}`),
			familyId: randomUUID(),
			expiresAt: expiredTimestamp,
		});

		await runScheduledCleanup({ batchSize: 500, maxIterationsPerTable: 20 });

		const remaining = await database
			.select()
			.from(schema.oauthRefreshTokens)
			.where(eq(schema.oauthRefreshTokens.refreshToken, refreshTokenHash));
		expect(remaining).toHaveLength(0);
	});

	it('deletes an expired oauth_authorization_transactions row', async () => {
		const transactionId = `deletion-coverage-transaction-${testRunId}`;
		await database.insert(schema.oauthAuthorizationTransactions).values({
			transactionId,
			csrfTokenHash: hashCredential(`deletion-coverage-csrf-${testRunId}`),
			userId,
			sessionTokenHash: hashCredential(`deletion-coverage-session-${testRunId}`),
			clientId,
			redirectUri: 'https://example.com/callback',
			codeChallenge: 'challenge',
			codeChallengeMethod: 'S256',
			issuer: 'https://app.example.com',
			expiresAt: expiredTimestamp,
		});

		await runScheduledCleanup({ batchSize: 500, maxIterationsPerTable: 20 });

		const remaining = await database
			.select()
			.from(schema.oauthAuthorizationTransactions)
			.where(eq(schema.oauthAuthorizationTransactions.transactionId, transactionId));
		expect(remaining).toHaveLength(0);
	});
});
