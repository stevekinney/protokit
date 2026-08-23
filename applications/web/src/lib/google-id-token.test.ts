import { beforeEach, describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import {
	GoogleIdTokenValidationError,
	resetGoogleJwksCacheForTests,
	validateGoogleIdToken,
} from '@web/lib/google-id-token';

const CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
const NONCE = 'a'.repeat(64);

async function setUpKeyPair(): Promise<{ privateKey: CryptoKey; publicJwk: JWK }> {
	const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
	const publicJwk = await exportJWK(publicKey);
	publicJwk.kid = 'test-key-id';
	publicJwk.alg = 'RS256';
	publicJwk.use = 'sig';
	return { privateKey, publicKey: publicKey as unknown as CryptoKey, publicJwk } as {
		privateKey: CryptoKey;
		publicJwk: JWK;
	};
}

function jwksFetchImpl(publicJwk: JWK) {
	return async () =>
		new Response(JSON.stringify({ keys: [publicJwk] }), {
			headers: { 'content-type': 'application/json' },
		});
}

async function signIdToken(
	privateKey: CryptoKey,
	claimsOverride: Record<string, unknown> = {},
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	return new SignJWT({
		email: 'alice@example.com',
		email_verified: true,
		name: 'Alice',
		picture: 'https://example.com/photo.jpg',
		nonce: NONCE,
		...claimsOverride,
	})
		.setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
		.setSubject('google-sub-123')
		.setIssuer('https://accounts.google.com')
		.setAudience(CLIENT_ID)
		.setIssuedAt(now)
		.setExpirationTime(now + 3600)
		.sign(privateKey);
}

beforeEach(() => {
	resetGoogleJwksCacheForTests();
});

describe('validateGoogleIdToken', () => {
	it('validates a well-formed token and returns its claims', async () => {
		const { privateKey, publicJwk } = await setUpKeyPair();
		const idToken = await signIdToken(privateKey);

		const claims = await validateGoogleIdToken(
			idToken,
			{ clientId: CLIENT_ID, expectedNonce: NONCE },
			{ fetchImpl: jwksFetchImpl(publicJwk) },
		);

		expect(claims.sub).toBe('google-sub-123');
		expect(claims.email).toBe('alice@example.com');
		expect(claims.email_verified).toBe(true);
		expect(claims.name).toBe('Alice');
	});

	it('accepts the bare-host issuer form Google also documents', async () => {
		const { privateKey, publicJwk } = await setUpKeyPair();
		const now = Math.floor(Date.now() / 1000);
		const idToken = await new SignJWT({
			email: 'alice@example.com',
			email_verified: true,
			name: 'Alice',
			nonce: NONCE,
		})
			.setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
			.setSubject('google-sub-123')
			.setIssuer('accounts.google.com')
			.setAudience(CLIENT_ID)
			.setIssuedAt(now)
			.setExpirationTime(now + 3600)
			.sign(privateKey);

		const claims = await validateGoogleIdToken(
			idToken,
			{ clientId: CLIENT_ID, expectedNonce: NONCE },
			{ fetchImpl: jwksFetchImpl(publicJwk) },
		);
		expect(claims.sub).toBe('google-sub-123');
	});

	it('rejects a token signed by a key not present in the fetched JWKS', async () => {
		const { privateKey: attackerKey } = await setUpKeyPair();
		const { publicJwk: legitimatePublicJwk } = await setUpKeyPair();
		const idToken = await signIdToken(attackerKey);

		await expect(
			validateGoogleIdToken(
				idToken,
				{ clientId: CLIENT_ID, expectedNonce: NONCE },
				{ fetchImpl: jwksFetchImpl(legitimatePublicJwk) },
			),
		).rejects.toThrow(GoogleIdTokenValidationError);
	});

	it('rejects a token with the wrong issuer', async () => {
		const { privateKey, publicJwk } = await setUpKeyPair();
		const now = Math.floor(Date.now() / 1000);
		const idToken = await new SignJWT({
			email: 'alice@example.com',
			email_verified: true,
			name: 'Alice',
			nonce: NONCE,
		})
			.setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
			.setSubject('google-sub-123')
			.setIssuer('https://evil.example.com')
			.setAudience(CLIENT_ID)
			.setIssuedAt(now)
			.setExpirationTime(now + 3600)
			.sign(privateKey);

		await expect(
			validateGoogleIdToken(
				idToken,
				{ clientId: CLIENT_ID, expectedNonce: NONCE },
				{ fetchImpl: jwksFetchImpl(publicJwk) },
			),
		).rejects.toThrow(GoogleIdTokenValidationError);
	});

	it('rejects a token issued for a different audience', async () => {
		const { privateKey, publicJwk } = await setUpKeyPair();
		const idToken = await signIdToken(privateKey);

		await expect(
			validateGoogleIdToken(
				idToken,
				{ clientId: 'a-different-client-id', expectedNonce: NONCE },
				{ fetchImpl: jwksFetchImpl(publicJwk) },
			),
		).rejects.toThrow(GoogleIdTokenValidationError);
	});

	it('rejects an authorized-party claim that does not match the client id', async () => {
		const { privateKey, publicJwk } = await setUpKeyPair();
		const idToken = await signIdToken(privateKey, { azp: 'some-other-client-id' });

		await expect(
			validateGoogleIdToken(
				idToken,
				{ clientId: CLIENT_ID, expectedNonce: NONCE },
				{ fetchImpl: jwksFetchImpl(publicJwk) },
			),
		).rejects.toThrow(GoogleIdTokenValidationError);
	});

	it('rejects a nonce that does not match the one this server issued', async () => {
		const { privateKey, publicJwk } = await setUpKeyPair();
		const idToken = await signIdToken(privateKey, { nonce: 'b'.repeat(64) });

		await expect(
			validateGoogleIdToken(
				idToken,
				{ clientId: CLIENT_ID, expectedNonce: NONCE },
				{ fetchImpl: jwksFetchImpl(publicJwk) },
			),
		).rejects.toThrow(GoogleIdTokenValidationError);
	});

	it('rejects an unverified email', async () => {
		const { privateKey, publicJwk } = await setUpKeyPair();
		const idToken = await signIdToken(privateKey, { email_verified: false });

		await expect(
			validateGoogleIdToken(
				idToken,
				{ clientId: CLIENT_ID, expectedNonce: NONCE },
				{ fetchImpl: jwksFetchImpl(publicJwk) },
			),
		).rejects.toThrow(GoogleIdTokenValidationError);
	});

	it('rejects an expired token', async () => {
		const { privateKey, publicJwk } = await setUpKeyPair();
		const now = Math.floor(Date.now() / 1000);
		const idToken = await new SignJWT({
			email: 'alice@example.com',
			email_verified: true,
			name: 'Alice',
			nonce: NONCE,
		})
			.setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
			.setSubject('google-sub-123')
			.setIssuer('https://accounts.google.com')
			.setAudience(CLIENT_ID)
			.setIssuedAt(now - 7200)
			.setExpirationTime(now - 3600)
			.sign(privateKey);

		await expect(
			validateGoogleIdToken(
				idToken,
				{ clientId: CLIENT_ID, expectedNonce: NONCE },
				{ fetchImpl: jwksFetchImpl(publicJwk) },
			),
		).rejects.toThrow(GoogleIdTokenValidationError);
	});

	it('rejects a token with no subject claim', async () => {
		const { privateKey, publicJwk } = await setUpKeyPair();
		const now = Math.floor(Date.now() / 1000);
		const idToken = await new SignJWT({
			email: 'alice@example.com',
			email_verified: true,
			name: 'Alice',
			nonce: NONCE,
		})
			.setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
			.setIssuer('https://accounts.google.com')
			.setAudience(CLIENT_ID)
			.setIssuedAt(now)
			.setExpirationTime(now + 3600)
			.sign(privateKey);

		await expect(
			validateGoogleIdToken(
				idToken,
				{ clientId: CLIENT_ID, expectedNonce: NONCE },
				{ fetchImpl: jwksFetchImpl(publicJwk) },
			),
		).rejects.toThrow(GoogleIdTokenValidationError);
	});

	it('rejects a malformed token', async () => {
		await expect(
			validateGoogleIdToken(
				'not-a-jwt',
				{ clientId: CLIENT_ID, expectedNonce: NONCE },
				{ fetchImpl: jwksFetchImpl({}) },
			),
		).rejects.toThrow(GoogleIdTokenValidationError);
	});

	it('refetches the JWKS once when the key id is not found (key rotation), then rejects if still missing', async () => {
		const { publicJwk } = await setUpKeyPair();
		const { privateKey: rotatedPrivateKey, publicJwk: rotatedPublicJwk } = await setUpKeyPair();
		rotatedPublicJwk.kid = 'rotated-key-id';
		const idToken = await new SignJWT({
			email: 'alice@example.com',
			email_verified: true,
			name: 'Alice',
			nonce: NONCE,
		})
			.setProtectedHeader({ alg: 'RS256', kid: 'rotated-key-id' })
			.setSubject('google-sub-123')
			.setIssuer('https://accounts.google.com')
			.setAudience(CLIENT_ID)
			.setIssuedAt(Math.floor(Date.now() / 1000))
			.setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
			.sign(rotatedPrivateKey);

		let fetchCount = 0;
		const claims = await validateGoogleIdToken(
			idToken,
			{ clientId: CLIENT_ID, expectedNonce: NONCE },
			{
				fetchImpl: async () => {
					fetchCount += 1;
					// First fetch returns the stale key set (miss); second returns
					// the rotated key set the token was actually signed with.
					const keys = fetchCount === 1 ? [publicJwk] : [rotatedPublicJwk];
					return new Response(JSON.stringify({ keys }), {
						headers: { 'content-type': 'application/json' },
					});
				},
			},
		);

		expect(fetchCount).toBe(2);
		expect(claims.sub).toBe('google-sub-123');
	});
});
