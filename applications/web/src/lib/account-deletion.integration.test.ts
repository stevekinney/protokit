import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';
import { deleteOauthClient, deleteUserAccount } from '@web/lib/account-deletion';
import { deleteTestAccounts } from '@web/test-support/delete-test-accounts';

/**
 * DATA-001 / S-18 acceptance criterion 4: "Account and client deletion
 * tests leave no usable session, code, token, subscription, or orphaned
 * service identity." Against the real test Postgres, not a mock — a mock
 * cannot prove a row is actually gone from the table `/mcp` and the token
 * endpoint query against, which is the entire point of this criterion.
 */

const createdUserIds: string[] = [];
const createdClientIds: string[] = [];

afterAll(async () => {
	// Best-effort: `deleteUserAccount`/`deleteOauthClient` are expected to
	// have already removed everything under test. This only cleans up rows
	// a failing assertion left behind, so a broken run doesn't poison the
	// shared test database for the next one.
	//
	// Two statements, not twelve. `DATA-001` cascades every child table from
	// `users` and `oauth_clients`, so walking each table by hand only bought
	// extra HTTP round trips through the local Neon proxy — enough to blow the
	// 5s hook budget on a continuous-integration runner. See
	// `test-support/delete-test-accounts.ts`.
	await deleteTestAccounts({ clientIds: createdClientIds, userIds: createdUserIds });
});

async function seedFullAccount() {
	const userId = randomUUID();
	createdUserIds.push(userId);
	const clientId = `account-deletion-test-client-${randomUUID()}`;
	createdClientIds.push(clientId);

	await database.insert(schema.users).values({
		id: userId,
		email: `account-deletion-${userId}@example.com`,
		name: 'Deletion Test User',
	});

	await database.insert(schema.oauthClients).values({
		clientId,
		clientName: 'Deletion Test Client',
		clientType: 'public',
		tokenEndpointAuthMethod: 'none',
		redirectUris: ['http://localhost:9999/callback'],
		grantTypes: ['authorization_code', 'refresh_token'],
		responseTypes: ['code'],
	});

	await database.insert(schema.userGoogleAccounts).values({
		googleSubject: `google-subject-${userId}`,
		userId,
		email: `account-deletion-${userId}@example.com`,
	});

	await database.insert(schema.userSessions).values({
		sessionTokenHash: hashCredential(randomBytes(32).toString('hex')),
		userId,
		expiresAt: new Date(Date.now() + 60_000),
	});

	await database.insert(schema.oauthAuthorizationTransactions).values({
		transactionId: randomUUID(),
		csrfTokenHash: hashCredential(randomBytes(16).toString('hex')),
		userId,
		sessionTokenHash: hashCredential(randomBytes(32).toString('hex')),
		clientId,
		redirectUri: 'http://localhost:9999/callback',
		codeChallenge: 'challenge',
		issuer: 'http://localhost:3000',
		expiresAt: new Date(Date.now() + 60_000),
	});

	await database.insert(schema.oauthCodes).values({
		code: hashCredential(randomBytes(16).toString('hex')),
		clientId,
		userId,
		redirectUri: 'http://localhost:9999/callback',
		codeChallenge: 'challenge',
		expiresAt: new Date(Date.now() + 60_000),
	});

	const accessToken = hashCredential(randomBytes(16).toString('hex'));
	await database.insert(schema.oauthTokens).values({
		accessToken,
		clientId,
		userId,
		expiresAt: new Date(Date.now() + 60_000),
	});

	await database.insert(schema.oauthRefreshTokens).values({
		refreshToken: hashCredential(randomBytes(16).toString('hex')),
		clientId,
		userId,
		accessTokenHash: accessToken,
		familyId: randomUUID(),
		expiresAt: new Date(Date.now() + 60_000),
	});

	return { userId, clientId };
}

describe('deleteUserAccount', () => {
	it('leaves no usable session, code, transaction, token, refresh token, or Google account row', async () => {
		const { userId } = await seedFullAccount();

		const result = await deleteUserAccount(userId);

		expect(result).toEqual({
			deletedAccessTokens: 1,
			deletedRefreshTokens: 1,
			deletedCodes: 1,
			deletedTransactions: 1,
			deletedSessions: 1,
			deletedGoogleAccounts: 1,
			deletedUser: true,
		});

		const [remainingUser] = await database
			.select()
			.from(schema.users)
			.where(eq(schema.users.id, userId))
			.limit(1);
		expect(remainingUser).toBeUndefined();

		const remainingSessions = await database
			.select()
			.from(schema.userSessions)
			.where(eq(schema.userSessions.userId, userId));
		expect(remainingSessions).toHaveLength(0);

		const remainingTokens = await database
			.select()
			.from(schema.oauthTokens)
			.where(eq(schema.oauthTokens.userId, userId));
		expect(remainingTokens).toHaveLength(0);

		const remainingRefreshTokens = await database
			.select()
			.from(schema.oauthRefreshTokens)
			.where(eq(schema.oauthRefreshTokens.userId, userId));
		expect(remainingRefreshTokens).toHaveLength(0);

		const remainingCodes = await database
			.select()
			.from(schema.oauthCodes)
			.where(eq(schema.oauthCodes.userId, userId));
		expect(remainingCodes).toHaveLength(0);

		const remainingTransactions = await database
			.select()
			.from(schema.oauthAuthorizationTransactions)
			.where(eq(schema.oauthAuthorizationTransactions.userId, userId));
		expect(remainingTransactions).toHaveLength(0);

		const remainingGoogleAccounts = await database
			.select()
			.from(schema.userGoogleAccounts)
			.where(eq(schema.userGoogleAccounts.userId, userId));
		expect(remainingGoogleAccounts).toHaveLength(0);
	});

	it('leaves the OAuth client registration untouched, since it is not user-owned', async () => {
		const { userId, clientId } = await seedFullAccount();

		await deleteUserAccount(userId);

		const [remainingClient] = await database
			.select()
			.from(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, clientId))
			.limit(1);
		expect(remainingClient).toBeDefined();
	});

	it('is idempotent: deleting an already-deleted account reports zero rows and does not throw', async () => {
		const { userId } = await seedFullAccount();
		await deleteUserAccount(userId);

		const secondResult = await deleteUserAccount(userId);
		expect(secondResult).toEqual({
			deletedAccessTokens: 0,
			deletedRefreshTokens: 0,
			deletedCodes: 0,
			deletedTransactions: 0,
			deletedSessions: 0,
			deletedGoogleAccounts: 0,
			deletedUser: false,
		});
	});
});

describe('deleteOauthClient', () => {
	it('leaves no usable code, token, refresh token, or authorization transaction for that client', async () => {
		const { userId, clientId } = await seedFullAccount();

		const result = await deleteOauthClient(clientId);

		expect(result).toEqual({
			deletedAccessTokens: 1,
			deletedRefreshTokens: 1,
			deletedCodes: 1,
			deletedTransactions: 1,
			deletedClient: true,
		});

		const remainingTokens = await database
			.select()
			.from(schema.oauthTokens)
			.where(eq(schema.oauthTokens.clientId, clientId));
		expect(remainingTokens).toHaveLength(0);

		const [remainingClient] = await database
			.select()
			.from(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, clientId))
			.limit(1);
		expect(remainingClient).toBeUndefined();

		// The user account itself is untouched by a client deletion.
		const [remainingUser] = await database
			.select()
			.from(schema.users)
			.where(eq(schema.users.id, userId))
			.limit(1);
		expect(remainingUser).toBeDefined();

		// Clean up the user row this test's own client-deletion path doesn't touch.
		await database
			.delete(schema.userGoogleAccounts)
			.where(eq(schema.userGoogleAccounts.userId, userId));
		await database.delete(schema.userSessions).where(eq(schema.userSessions.userId, userId));
		await database.delete(schema.users).where(eq(schema.users.id, userId));
	});
});
