import { describe, expect, test } from 'bun:test';

import type {
	AccessToken,
	AuthorizationCode,
	AuthorizationTransaction,
	OAuthStores,
	RefreshToken,
	RegisteredClient,
} from '../oauth/stores.js';

export type OAuthStoreConformanceFactory = () => OAuthStores | Promise<OAuthStores>;

const baseTime = new Date('2026-01-01T00:00:00.000Z');
const laterTime = new Date('2099-01-01T00:00:00.000Z');
const expiredTime = new Date('2025-12-31T23:00:00.000Z');

function transaction(
	overrides: Partial<Omit<AuthorizationTransaction, 'transactionIdHash'>> = {},
): Omit<AuthorizationTransaction, 'transactionIdHash'> {
	return {
		userId: 'user-one',
		clientId: 'client-one',
		redirectUri: 'https://client.example/callback',
		codeChallenge: 'challenge',
		codeChallengeMethod: 'S256',
		state: 'state',
		issuer: 'https://issuer.example',
		resource: 'https://resource.example',
		scope: 'profile:read',
		expiresAt: laterTime,
		consumedAt: null,
		createdAt: baseTime,
		...overrides,
	};
}

function code(overrides: Partial<AuthorizationCode> = {}): AuthorizationCode {
	return {
		codeHash: 'code-one',
		clientId: 'client-one',
		userId: 'user-one',
		redirectUri: 'https://client.example/callback',
		codeChallenge: 'challenge',
		codeChallengeMethod: 'S256',
		scope: 'profile:read',
		state: 'state',
		resource: 'https://resource.example',
		expiresAt: laterTime,
		usedAt: null,
		createdAt: baseTime,
		...overrides,
	};
}

function accessToken(overrides: Partial<AccessToken> = {}): AccessToken {
	return {
		accessTokenHash: 'access-one',
		clientId: 'client-one',
		userId: 'user-one',
		scope: 'profile:read prompts:read',
		resource: 'https://resource.example',
		expiresAt: laterTime,
		revokedAt: null,
		createdAt: baseTime,
		...overrides,
	};
}

function refreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
	return {
		refreshTokenHash: 'refresh-one',
		clientId: 'client-one',
		userId: 'user-one',
		scope: 'profile:read prompts:read',
		resource: 'https://resource.example',
		accessTokenHash: 'access-one',
		familyId: 'family-one',
		expiresAt: laterTime,
		revokedAt: null,
		createdAt: baseTime,
		...overrides,
	};
}

function client(overrides: Partial<RegisteredClient> = {}): RegisteredClient {
	return {
		clientId: 'client-one',
		clientSecretHash: 'secret-hash',
		clientName: 'Client One',
		clientType: 'confidential',
		tokenEndpointAuthMethod: 'client_secret_post',
		applicationType: 'web',
		redirectUris: ['https://client.example/callback'],
		grantTypes: ['authorization_code'],
		responseTypes: ['code'],
		clientIdMetadataUrl: null,
		clientSecretExpiresAt: laterTime,
		createdAt: baseTime,
		updatedAt: baseTime,
		...overrides,
	};
}

export function runOAuthStoreConformance(
	label: string,
	createStores: OAuthStoreConformanceFactory,
): void {
	describe(`${label} OAuth store conformance`, () => {
		test('transaction consumption is atomic, binding-aware, expiring, and exactly compensable', async () => {
			const { transactions } = await createStores();
			await transactions.create({
				record: transaction(),
				transactionId: 'transaction-one',
				csrfToken: 'csrf-one',
				consentBinding: 'binding-one',
			});
			expect(await transactions.consume('transaction-one', 'csrf-one', 'wrong-binding')).toBeNull();
			const results = await Promise.all([
				transactions.consume('transaction-one', 'csrf-one', 'binding-one'),
				transactions.consume('transaction-one', 'csrf-one', 'binding-one'),
			]);
			const consumed = results.filter((result) => result !== null);
			expect(consumed).toHaveLength(1);
			expect(await transactions.unconsume('transaction-one', new Date(0))).toBe(false);
			expect(await transactions.unconsume('transaction-one', consumed[0]!.consumedAt)).toBe(true);
			expect(
				await transactions.consume('transaction-one', 'csrf-one', 'binding-one'),
			).not.toBeNull();
		});

		test('transaction deletion preserves opaque binding and durable subject boundaries', async () => {
			const { transactions } = await createStores();
			await transactions.create({
				record: transaction(),
				transactionId: 'one',
				csrfToken: 'csrf',
				consentBinding: 'binding-one',
			});
			await transactions.create({
				record: transaction({ userId: 'user-two' }),
				transactionId: 'two',
				csrfToken: 'csrf',
				consentBinding: 'binding-two',
			});
			expect(await transactions.deleteByBinding('binding-one')).toBe(1);
			expect(await transactions.deleteAllForUser('user-two')).toBe(1);
		});

		test('transaction purge uses the supplied clock', async () => {
			const { transactions } = await createStores();
			await transactions.create({
				record: transaction({ expiresAt: expiredTime }),
				transactionId: 'expired',
				csrfToken: 'csrf',
				consentBinding: 'binding',
			});
			await transactions.create({
				record: transaction(),
				transactionId: 'live',
				csrfToken: 'csrf',
				consentBinding: 'binding',
			});
			expect(await transactions.purgeExpired(baseTime)).toBe(1);
			expect(await transactions.consume('live', 'csrf', 'binding')).not.toBeNull();
		});

		test('authorization code consume is concurrent-single-use and compensation is marker-fenced', async () => {
			const { codes } = await createStores();
			await codes.issue(code());
			const results = await Promise.all([
				codes.consume('code-one', baseTime),
				codes.consume('code-one', baseTime),
			]);
			const consumed = results.filter((result) => result !== null);
			expect(consumed).toHaveLength(1);
			expect(await codes.unconsume('code-one', new Date(0))).toBe(false);
			expect(await codes.unconsume('code-one', consumed[0]!.usedAt)).toBe(true);
			expect(await codes.consume('code-one', laterTime)).toBeNull();
		});

		test('authorization code deletion and purge use user and supplied-time boundaries', async () => {
			const { codes } = await createStores();
			await codes.issue(code({ codeHash: 'expired', expiresAt: expiredTime }));
			await codes.issue(code({ codeHash: 'other-user', userId: 'user-two' }));
			expect(await codes.purgeExpired(baseTime)).toBe(1);
			expect(await codes.deleteAllForUser('user-two')).toBe(1);
		});

		test('refresh rotation narrows scope, revokes the paired access token, and detects replay', async () => {
			const { tokens } = await createStores();
			await tokens.issueAuthorizationGrant({
				accessToken: accessToken(),
				refreshToken: refreshToken(),
			});
			const rejected = await tokens.rotateRefreshToken({
				priorHash: 'refresh-one',
				clientId: 'client-one',
				resource: 'https://resource.example',
				requestedScope: 'unknown:read',
				nextAccessTokenHash: 'unused-access',
				nextRefreshTokenHash: 'unused-refresh',
				accessTokenExpiresAt: laterTime,
				refreshTokenExpiresAt: laterTime,
				createdAt: baseTime,
			});
			expect(rejected).toEqual({ status: 'scope_rejected' });
			const rotated = await tokens.rotateRefreshToken({
				priorHash: 'refresh-one',
				clientId: 'client-one',
				resource: 'https://resource.example',
				requestedScope: 'profile:read',
				nextAccessTokenHash: 'access-two',
				nextRefreshTokenHash: 'refresh-two',
				accessTokenExpiresAt: laterTime,
				refreshTokenExpiresAt: laterTime,
				createdAt: baseTime,
			});
			expect(rotated.status).toBe('rotated');
			expect((await tokens.findByHash('access-one'))?.revokedAt).not.toBeNull();
			expect(
				await tokens.rotateRefreshToken({
					priorHash: 'refresh-one',
					clientId: 'client-one',
					resource: 'https://resource.example',
					nextAccessTokenHash: 'access-three',
					nextRefreshTokenHash: 'refresh-three',
					accessTokenExpiresAt: laterTime,
					refreshTokenExpiresAt: laterTime,
					createdAt: baseTime,
				}),
			).toEqual({ status: 'replay_revoked', userId: 'user-one', familyId: 'family-one' });
			expect((await tokens.findByHash('access-two'))?.revokedAt).not.toBeNull();
		});

		test('family revocation spans refresh tokens and descendant access tokens', async () => {
			const { tokens } = await createStores();
			await tokens.issueAuthorizationGrant({
				accessToken: accessToken(),
				refreshToken: refreshToken(),
			});
			expect(await tokens.revokeFamily('family-one')).toBe(2);
			expect((await tokens.findByHash('access-one'))?.revokedAt).not.toBeNull();
			expect(await tokens.revokeRefreshToken('refresh-one', 'client-one')).toEqual({
				status: 'replay_revoked',
				userId: 'user-one',
				familyId: 'family-one',
			});
		});

		test('token purge retains rotated credentials until their own expiry', async () => {
			const { tokens } = await createStores();
			await tokens.issueAuthorizationGrant({
				accessToken: accessToken(),
				refreshToken: refreshToken(),
			});
			await tokens.rotateRefreshToken({
				priorHash: 'refresh-one',
				clientId: 'client-one',
				resource: 'https://resource.example',
				nextAccessTokenHash: 'access-two',
				nextRefreshTokenHash: 'refresh-two',
				accessTokenExpiresAt: laterTime,
				refreshTokenExpiresAt: laterTime,
				createdAt: baseTime,
			});
			expect(await tokens.purgeExpired(baseTime)).toBe(0);
			expect(
				await tokens.rotateRefreshToken({
					priorHash: 'refresh-one',
					clientId: 'client-one',
					resource: 'https://resource.example',
					nextAccessTokenHash: 'access-three',
					nextRefreshTokenHash: 'refresh-three',
					accessTokenExpiresAt: laterTime,
					refreshTokenExpiresAt: laterTime,
					createdAt: baseTime,
				}),
			).toEqual({ status: 'replay_revoked', userId: 'user-one', familyId: 'family-one' });
		});

		test('client registration, upsert, lookup, and update are isolated from caller mutation', async () => {
			const { clients } = await createStores();
			const record = client();
			await clients.register(record);
			record.redirectUris.push('https://attacker.example');
			expect((await clients.findById('client-one'))?.redirectUris).toEqual([
				'https://client.example/callback',
			]);
			await expect(clients.register(client())).rejects.toThrow();
			await clients.update('client-one', { clientName: 'Updated' });
			expect((await clients.findById('client-one'))?.clientName).toBe('Updated');
			await clients.upsert(client({ clientName: 'Replaced' }));
			expect((await clients.findById('client-one'))?.clientName).toBe('Replaced');
		});

		test('composite deletion fans out across every user-owned store and excludes clients', async () => {
			const stores = await createStores();
			await stores.transactions.create({
				record: transaction(),
				transactionId: 'one',
				csrfToken: 'csrf',
				consentBinding: 'binding',
			});
			await stores.codes.issue(code());
			await stores.tokens.issueAuthorizationGrant({
				accessToken: accessToken(),
				refreshToken: refreshToken(),
			});
			await stores.clients.register(client());
			expect(await stores.deleteAllForUser('user-one')).toEqual({
				transactions: 1,
				codes: 1,
				tokens: 2,
			});
			expect(await stores.clients.findById('client-one')).not.toBeNull();
		});
	});
}
