import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import {
	consumeAuthorizationTransaction,
	createAuthorizationTransaction,
} from '@web/lib/authorization-transaction';
import { hashCredential } from '@web/lib/hash-credential';

/**
 * Real-Postgres coverage for SEC-005 / S-09's acceptance criteria: "a
 * missing, mismatched, expired, replayed, cross-session, or cross-user
 * authorization transaction is rejected and creates no code." Every case
 * here exercises the same single `UPDATE ... WHERE ... RETURNING`
 * `consumeAuthorizationTransaction` uses in production — nothing here is
 * mocked, so a regression that weakens the `WHERE` clause (or a database
 * driver quirk the mocked unit suite can't see) would fail this file even
 * if `oauth-routes.test.tsx`'s mocked suite stayed green.
 *
 * Runs against the shared local test database other wave agents also use;
 * every row this file creates is scoped under one random UUID prefix and
 * cleaned up in `afterAll`, so a concurrent run cannot collide with it.
 */

const testRunId = randomUUID();
const userId = randomUUID();
const otherUserId = randomUUID();
const clientId = `authorization-transaction-test-${testRunId}`;

async function seedUser(id: string, email: string): Promise<void> {
	await database.insert(schema.users).values({
		id,
		email,
		name: 'Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
}

beforeAll(async () => {
	await seedUser(userId, `authorization-transaction-test-${testRunId}@example.com`);
	await seedUser(otherUserId, `authorization-transaction-test-other-${testRunId}@example.com`);
	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: hashCredential('test-client-secret'),
		clientName: 'Authorization Transaction Test Client',
		clientType: 'confidential',
		tokenEndpointAuthMethod: 'client_secret_post',
		redirectUris: ['https://example.com/callback'],
		grantTypes: ['authorization_code', 'refresh_token'],
		responseTypes: ['code'],
	});
});

afterAll(async () => {
	await database
		.delete(schema.oauthAuthorizationTransactions)
		.where(eq(schema.oauthAuthorizationTransactions.clientId, clientId));
	await database.delete(schema.oauthClients).where(eq(schema.oauthClients.clientId, clientId));
	await database.delete(schema.users).where(eq(schema.users.id, userId));
	await database.delete(schema.users).where(eq(schema.users.id, otherUserId));
});

function baseTransactionInput(
	overrides: Partial<Parameters<typeof createAuthorizationTransaction>[0]> = {},
) {
	return {
		userId,
		sessionToken: 'session-token-abc',
		clientId,
		redirectUri: 'https://example.com/callback',
		codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
		codeChallengeMethod: 'S256',
		state: 'state-xyz',
		issuer: 'http://localhost:3000',
		resource: 'http://localhost:3000/mcp',
		scope: 'profile:read',
		...overrides,
	};
}

describe('createAuthorizationTransaction / consumeAuthorizationTransaction (real Postgres)', () => {
	it('creates a transaction whose id and csrf token consume it exactly once', async () => {
		const created = await createAuthorizationTransaction(baseTransactionInput());

		const consumed = await consumeAuthorizationTransaction({
			transactionId: created.transactionId,
			csrfToken: created.csrfToken,
			userId,
			sessionToken: 'session-token-abc',
		});

		expect(consumed).toEqual({
			clientId,
			redirectUri: 'https://example.com/callback',
			codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
			codeChallengeMethod: 'S256',
			state: 'state-xyz',
			issuer: 'http://localhost:3000',
			resource: 'http://localhost:3000/mcp',
			scope: 'profile:read',
		});
	});

	it('rejects a replayed consume of an already-consumed transaction', async () => {
		const created = await createAuthorizationTransaction(baseTransactionInput());

		const firstConsume = await consumeAuthorizationTransaction({
			transactionId: created.transactionId,
			csrfToken: created.csrfToken,
			userId,
			sessionToken: 'session-token-abc',
		});
		expect(firstConsume).not.toBeNull();

		const secondConsume = await consumeAuthorizationTransaction({
			transactionId: created.transactionId,
			csrfToken: created.csrfToken,
			userId,
			sessionToken: 'session-token-abc',
		});
		expect(secondConsume).toBeNull();
	});

	it('rejects a missing transaction id', async () => {
		const consumed = await consumeAuthorizationTransaction({
			transactionId: 'does-not-exist',
			csrfToken: 'anything',
			userId,
			sessionToken: 'session-token-abc',
		});
		expect(consumed).toBeNull();
	});

	it('rejects a mismatched csrf token', async () => {
		const created = await createAuthorizationTransaction(baseTransactionInput());

		const consumed = await consumeAuthorizationTransaction({
			transactionId: created.transactionId,
			csrfToken: 'wrong-csrf-token',
			userId,
			sessionToken: 'session-token-abc',
		});
		expect(consumed).toBeNull();
	});

	it('rejects a cross-user consume attempt', async () => {
		const created = await createAuthorizationTransaction(baseTransactionInput());

		const consumed = await consumeAuthorizationTransaction({
			transactionId: created.transactionId,
			csrfToken: created.csrfToken,
			userId: otherUserId,
			sessionToken: 'session-token-abc',
		});
		expect(consumed).toBeNull();
	});

	it('rejects a cross-session consume attempt for the same user', async () => {
		const created = await createAuthorizationTransaction(baseTransactionInput());

		const consumed = await consumeAuthorizationTransaction({
			transactionId: created.transactionId,
			csrfToken: created.csrfToken,
			userId,
			sessionToken: 'a-different-session-token',
		});
		expect(consumed).toBeNull();
	});

	it('rejects an expired transaction', async () => {
		const created = await createAuthorizationTransaction(baseTransactionInput());

		// Force expiry directly — createAuthorizationTransaction always sets a
		// 10-minute TTL, so this simulates the passage of time without a
		// sleep, which the project's diagnosis rules forbid using to mask a
		// real wait.
		await database
			.update(schema.oauthAuthorizationTransactions)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(
				eq(
					schema.oauthAuthorizationTransactions.transactionId,
					hashCredential(created.transactionId),
				),
			);

		const consumed = await consumeAuthorizationTransaction({
			transactionId: created.transactionId,
			csrfToken: created.csrfToken,
			userId,
			sessionToken: 'session-token-abc',
		});
		expect(consumed).toBeNull();
	});

	it('never stores the raw transaction id or csrf token, only their hashes', async () => {
		const created = await createAuthorizationTransaction(baseTransactionInput());

		const [row] = await database
			.select()
			.from(schema.oauthAuthorizationTransactions)
			.where(
				eq(
					schema.oauthAuthorizationTransactions.transactionId,
					hashCredential(created.transactionId),
				),
			)
			.limit(1);

		expect(row).toBeDefined();
		expect(row!.transactionId).not.toBe(created.transactionId);
		expect(row!.transactionId).toBe(hashCredential(created.transactionId));
		expect(row!.csrfTokenHash).not.toBe(created.csrfToken);
		expect(row!.csrfTokenHash).toBe(hashCredential(created.csrfToken));
	});
});
