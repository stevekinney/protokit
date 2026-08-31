import { importJWK, jwtVerify, type JWK, type JWTPayload } from 'jose';
import { logger } from '@lostgradient/mcp/logger';
import { constantTimeEquals } from '@lostgradient/mcp/oauth';
import {
	fetchGoogleEndpointBounded,
	GoogleOutboundFetchError,
	type GoogleOutboundFetchDependencies,
} from '@web/lib/google-outbound-fetch';
import {
	googleIdTokenClockToleranceSeconds,
	googleJwksCacheTtlMs,
	googleJwksFetchTimeoutMs,
	googleJwksMaxResponseBytes,
} from '@web/lib/request-limits';

/**
 * FEDAUTH-001 / S-16: validates a Google-issued OpenID Connect ID token
 * against Google's published signing keys instead of trusting the bearer
 * access token alone. Every failure mode — wrong signature, wrong issuer,
 * wrong audience, wrong authorized party, nonce mismatch, expired/not-yet-
 * valid, missing/unverified email — throws the same error type so the
 * caller has one branch: reject, create no local session.
 *
 * Google's own OpenID Provider Configuration
 * (https://accounts.google.com/.well-known/openid-configuration) is not
 * fetched here: `jwks_uri` and `issuer` from that document would otherwise
 * be attacker-reachable if the discovery endpoint were ever compromised or
 * DNS-spoofed, and this server would trust whatever URLs it named. Both
 * values are Google's own long-published, stable constants instead, and
 * only the JWKS document itself (never an endpoint URL) is fetched, bounded,
 * and cached.
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_JWKS_HOST = 'www.googleapis.com';

/** Google documents both forms as valid `iss` values for its ID tokens. */
const GOOGLE_ID_TOKEN_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

type GoogleJwksDocument = { keys: JWK[] };

type CachedJwks = { keys: JWK[]; expiresAt: number };

let cachedJwks: CachedJwks | null = null;

async function loadGoogleJwks(
	now: number,
	dependencies: GoogleOutboundFetchDependencies,
): Promise<JWK[]> {
	if (cachedJwks && cachedJwks.expiresAt > now) {
		return cachedJwks.keys;
	}

	const { text } = await fetchGoogleEndpointBounded(
		GOOGLE_JWKS_URL,
		{
			method: 'GET',
			headers: { accept: 'application/json' },
			timeoutMs: googleJwksFetchTimeoutMs,
			expectedContentType: 'application/json',
			maxResponseBytes: googleJwksMaxResponseBytes,
			expectedHost: GOOGLE_JWKS_HOST,
		},
		dependencies,
	);

	let parsed: GoogleJwksDocument;
	try {
		parsed = JSON.parse(text) as GoogleJwksDocument;
	} catch {
		throw new GoogleOutboundFetchError('invalid_jwks_json');
	}

	if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
		throw new GoogleOutboundFetchError('empty_jwks');
	}

	cachedJwks = { keys: parsed.keys, expiresAt: now + googleJwksCacheTtlMs };
	return parsed.keys;
}

export type GoogleIdTokenClaims = {
	sub: string;
	email: string;
	email_verified: true;
	name: string;
	picture?: string;
};

export class GoogleIdTokenValidationError extends Error {
	constructor(public readonly reason: string) {
		super(reason);
		this.name = 'GoogleIdTokenValidationError';
	}
}

function decodeUnverifiedHeader(idToken: string): { kid?: string; alg?: string } {
	const headerSegment = idToken.split('.')[0];
	if (!headerSegment) {
		throw new GoogleIdTokenValidationError('malformed_token');
	}

	try {
		return JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf-8')) as {
			kid?: string;
			alg?: string;
		};
	} catch {
		throw new GoogleIdTokenValidationError('malformed_token');
	}
}

/**
 * Validates a Google ID token's signature, issuer, audience, authorized
 * party, one-time nonce, subject, verified email, and time claims against
 * Google's cached, bounded-fetched JWKS. Returns the claims this server
 * needs; throws `GoogleIdTokenValidationError` for every rejection reason.
 */
export async function validateGoogleIdToken(
	idToken: string,
	input: { clientId: string; expectedNonce: string; now?: () => number },
	dependencies: GoogleOutboundFetchDependencies = {},
): Promise<GoogleIdTokenClaims> {
	const now = input.now ?? (() => Date.now());
	const header = decodeUnverifiedHeader(idToken);

	if (header.alg !== 'RS256') {
		throw new GoogleIdTokenValidationError('unsupported_algorithm');
	}
	if (!header.kid) {
		throw new GoogleIdTokenValidationError('missing_key_id');
	}

	let keys: JWK[];
	try {
		keys = await loadGoogleJwks(now(), dependencies);
	} catch (error) {
		logger.warn({ err: error }, 'Failed to load Google JWKS');
		throw new GoogleIdTokenValidationError('jwks_unavailable');
	}

	let matchingKey = keys.find((key) => key.kid === header.kid);
	if (!matchingKey) {
		// Key rotation: Google rotates signing keys periodically. Refetch once,
		// bypassing the cache, before giving up on this key id.
		cachedJwks = null;
		try {
			keys = await loadGoogleJwks(now(), dependencies);
		} catch (error) {
			logger.warn({ err: error }, 'Failed to reload Google JWKS after key-id miss');
			throw new GoogleIdTokenValidationError('jwks_unavailable');
		}
		matchingKey = keys.find((key) => key.kid === header.kid);
	}

	if (!matchingKey) {
		throw new GoogleIdTokenValidationError('unknown_key_id');
	}

	let payload: JWTPayload;
	try {
		const publicKey = await importJWK(matchingKey, 'RS256');
		({ payload } = await jwtVerify(idToken, publicKey, {
			issuer: GOOGLE_ID_TOKEN_ISSUERS,
			audience: input.clientId,
			algorithms: ['RS256'],
			clockTolerance: googleIdTokenClockToleranceSeconds,
			currentDate: new Date(now()),
		}));
	} catch (error) {
		logger.warn({ err: error }, 'Google ID token signature or claim verification failed');
		throw new GoogleIdTokenValidationError('signature_or_claim_invalid');
	}

	const authorizedParty = payload['azp'];
	if (authorizedParty !== undefined && authorizedParty !== input.clientId) {
		throw new GoogleIdTokenValidationError('authorized_party_mismatch');
	}

	const nonceClaim = payload['nonce'];
	if (typeof nonceClaim !== 'string' || !constantTimeEquals(nonceClaim, input.expectedNonce)) {
		throw new GoogleIdTokenValidationError('nonce_mismatch');
	}

	const subject = payload.sub;
	const email = payload['email'];
	const emailVerified = payload['email_verified'];
	const name = payload['name'];
	const picture = payload['picture'];

	if (typeof subject !== 'string' || subject.length === 0) {
		throw new GoogleIdTokenValidationError('missing_subject');
	}
	if (typeof email !== 'string' || email.length === 0) {
		throw new GoogleIdTokenValidationError('missing_email');
	}
	if (emailVerified !== true) {
		throw new GoogleIdTokenValidationError('email_not_verified');
	}
	if (typeof name !== 'string' || name.length === 0) {
		throw new GoogleIdTokenValidationError('missing_name');
	}

	return {
		sub: subject,
		email,
		email_verified: true,
		name,
		picture: typeof picture === 'string' ? picture : undefined,
	};
}

/** Test-only: clears the module-local JWKS cache so tests don't leak state across files/cases. */
export function resetGoogleJwksCacheForTests(): void {
	cachedJwks = null;
}
