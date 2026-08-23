import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';
import { runScheduledCleanup } from '@web/lib/scheduled-cleanup';
import { deleteTestAccounts } from '@web/test-support/delete-test-accounts';

/**
 * Review finding (P2, `scheduled-cleanup.ts:136`): `handleOauthTokenAuthorizationCodeGrant`
 * marks a code `usedAt` BEFORE minting its tokens, then compensates a failed
 * mint by reopening it (`usedAt = null`) so a client's retry can still
 * redeem it -- `handleOauthAuthorizeApprove` does the identical
 * mark-then-maybe-reopen dance with `consumedAt` on an authorization
 * transaction. Before this fix, cleanup deleted any row with a non-null
 * `usedAt`/`consumedAt` REGARDLESS of whether it was still inside its
 * normal, short-lived `expiresAt` window -- a sweep landing between "marked
 * used/consumed" and "reopened by compensation" could permanently delete
 * the row, turning a transient issuance failure into a permanent one with
 * no way to retry and no evidence of why.
 *
 * This proves the fix directly: a code/transaction marked used/consumed
 * but still well within its `expiresAt` window survives a cleanup sweep.
 */

const testRunId = randomUUID();
const userId = randomUUID();
const clientId = `scheduled-cleanup-retention-test-${testRunId}`;

beforeAll(async () => {
	await database.insert(schema.users).values({
		id: userId,
		email: `scheduled-cleanup-retention-test-${testRunId}@example.com`,
		name: 'Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: hashCredential('test-client-secret'),
		clientName: 'Scheduled Cleanup Retention Test Client',
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

describe('runScheduledCleanup retains used/consumed rows within their compensation window', () => {
	it('does not delete an oauth_codes row marked usedAt while still well inside expiresAt', async () => {
		const codeHash = hashCredential(`retention-test-code-${testRunId}`);
		await database.insert(schema.oauthCodes).values({
			code: codeHash,
			clientId,
			userId,
			redirectUri: 'https://example.com/callback',
			codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
			codeChallengeMethod: 'S256',
			scope: 'profile:read',
			resource: 'http://localhost:3000/mcp',
			// Marked used, simulating the window between consumption and a
			// compensating reopen -- but nowhere near expiry.
			usedAt: new Date(),
			expiresAt: new Date(Date.now() + 10 * 60 * 1000),
		});

		await runScheduledCleanup();

		const [row] = await database
			.select({ code: schema.oauthCodes.code })
			.from(schema.oauthCodes)
			.where(eq(schema.oauthCodes.code, codeHash))
			.limit(1);
		expect(row).toBeDefined();

		await database.delete(schema.oauthCodes).where(eq(schema.oauthCodes.code, codeHash));
	});

	it('does not delete an oauth_authorization_transactions row marked consumedAt while still well inside expiresAt', async () => {
		const transactionIdHash = hashCredential(`retention-test-transaction-${testRunId}`);
		await database.insert(schema.oauthAuthorizationTransactions).values({
			transactionId: transactionIdHash,
			csrfTokenHash: hashCredential(`retention-test-csrf-${testRunId}`),
			userId,
			sessionTokenHash: hashCredential(`retention-test-session-${testRunId}`),
			clientId,
			redirectUri: 'https://example.com/callback',
			codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
			codeChallengeMethod: 'S256',
			state: null,
			issuer: 'http://localhost:3000',
			resource: 'http://localhost:3000/mcp',
			scope: 'profile:read',
			// Marked consumed, simulating the window between consumption and a
			// compensating reopen -- but nowhere near expiry.
			consumedAt: new Date(),
			expiresAt: new Date(Date.now() + 10 * 60 * 1000),
		});

		await runScheduledCleanup();

		const [row] = await database
			.select({ transactionId: schema.oauthAuthorizationTransactions.transactionId })
			.from(schema.oauthAuthorizationTransactions)
			.where(eq(schema.oauthAuthorizationTransactions.transactionId, transactionIdHash))
			.limit(1);
		expect(row).toBeDefined();

		await database
			.delete(schema.oauthAuthorizationTransactions)
			.where(eq(schema.oauthAuthorizationTransactions.transactionId, transactionIdHash));
	});
});
