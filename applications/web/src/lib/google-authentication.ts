import { createHash, createHmac, randomBytes } from 'node:crypto';
import { environment } from '@web/env';
import { constantTimeEquals } from '@web/lib/constant-time-equals';
import { parseCookies, serializeCookie } from '@web/lib/cookies';
import { getBaseUrl } from '@web/lib/base-url';
import {
	fetchGoogleEndpointBounded,
	type GoogleOutboundFetchDependencies,
} from '@web/lib/google-outbound-fetch';
import {
	claimSingleUse,
	type GoogleOauthSingleUseStoreDependencies,
} from '@web/lib/google-oauth-single-use-store';
import { hashCredential } from '@web/lib/hash-credential';
import { isValidPkceCodeVerifier } from '@web/lib/pkce-validation';
import {
	googleOauthStateCookieMaxCount,
	googleTokenFetchTimeoutMs,
	googleTokenMaxResponseBytes,
	googleUserInfoFetchTimeoutMs,
	googleUserInfoMaxResponseBytes,
} from '@web/lib/request-limits';
import { sessionSigningSecret, sessionSigningSecrets } from '@web/lib/session-signing-secret';

/**
 * FEDAUTH-001 / S-16: hardens the upstream Google sign-in flow. Each
 * sign-in attempt gets its own cookie (`google_oauth_state_<suffix>`,
 * suffix derived from that attempt's own `state`) so concurrent tabs never
 * overwrite each other's login state, a PKCE `S256` challenge, and an
 * OpenID Connect nonce carried through to `google-id-token.ts` for ID-token
 * validation. The cookie only proves the value was issued by this server
 * and has not expired; `google-oauth-single-use-store.ts` is what makes the
 * `state` actually single-use.
 */

const GOOGLE_OAUTH_STATE_COOKIE_PREFIX = 'google_oauth_state_';
const GOOGLE_OAUTH_STATE_TIME_TO_LIVE_SECONDS = 10 * 60;

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKEN_ENDPOINT_HOST = 'oauth2.googleapis.com';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_USERINFO_ENDPOINT_HOST = 'openidconnect.googleapis.com';

/** Fixed-length, fixed-alphabet: matches `randomBytes(32).toString('hex')`. Checked before it is ever used to derive a cookie name or a Redis key. */
const googleOauthStatePattern = /^[0-9a-f]{64}$/;

type GoogleOauthCookiePayload = {
	state: string;
	nonce: string;
	codeVerifier: string;
	callbackPath: string;
	expiresAtEpochMilliseconds: number;
};

type GoogleTokenResponse = {
	access_token?: string;
	token_type?: string;
	expires_in?: number;
	id_token?: string;
};

export type GoogleUserProfile = {
	sub: string;
	email: string;
	email_verified: boolean;
	name: string;
	picture?: string;
};

export type GoogleTokenExchangeResult = {
	accessToken: string;
	idToken: string;
};

function sanitizeCallbackPath(value: string | null): string {
	if (!value || !value.startsWith('/')) {
		return '/';
	}

	if (value.startsWith('//') || value.startsWith('/\\')) {
		return '/';
	}

	return value;
}

function isValidGoogleOauthStateFormat(value: string): boolean {
	return googleOauthStatePattern.test(value);
}

function googleOauthStateCookieName(state: string): string {
	return `${GOOGLE_OAUTH_STATE_COOKIE_PREFIX}${state.slice(0, 16)}`;
}

function createSignature(payload: string, secret: string = sessionSigningSecret): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * DATA-001 / S-18: checks the payload's signature against every secret still
 * inside the session-signing-secret's rotation overlap window
 * (`sessionSigningSecrets`), not only the current one — a Google sign-in
 * attempt started just before a rotation must still be able to complete
 * during this state cookie's short (10-minute) lifetime.
 */
function isValidSignature(payloadBase64: string, signature: string): boolean {
	return sessionSigningSecrets.some((secret) =>
		constantTimeEquals(createSignature(payloadBase64, secret), signature),
	);
}

function encodeGoogleStatePayload(payload: GoogleOauthCookiePayload): string {
	const serializedPayload = JSON.stringify(payload);
	const payloadBase64 = Buffer.from(serializedPayload, 'utf-8').toString('base64url');
	const signature = createSignature(payloadBase64);
	return `${payloadBase64}.${signature}`;
}

function decodeGoogleStatePayload(value: string): GoogleOauthCookiePayload | null {
	const separatorIndex = value.indexOf('.');
	if (separatorIndex < 0) {
		return null;
	}

	const payloadBase64 = value.slice(0, separatorIndex);
	const signature = value.slice(separatorIndex + 1);

	if (!isValidSignature(payloadBase64, signature)) {
		return null;
	}

	try {
		const serializedPayload = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
		const payload = JSON.parse(serializedPayload) as GoogleOauthCookiePayload;
		if (
			!payload.state ||
			!payload.nonce ||
			!payload.codeVerifier ||
			!payload.callbackPath ||
			!payload.expiresAtEpochMilliseconds
		) {
			return null;
		}

		if (!isValidGoogleOauthStateFormat(payload.state)) {
			return null;
		}

		if (!isValidPkceCodeVerifier(payload.codeVerifier)) {
			return null;
		}

		if (payload.expiresAtEpochMilliseconds < Date.now()) {
			return null;
		}

		return payload;
	} catch {
		return null;
	}
}

function generatePkceCodeVerifier(): string {
	// 32 random bytes -> 43 base64url characters, the minimum RFC 7636 §4.1
	// `code_verifier` length and comfortably inside the 43-128 range.
	return randomBytes(32).toString('base64url');
}

function computePkceCodeChallengeS256(codeVerifier: string): string {
	return createHash('sha256').update(codeVerifier).digest('base64url');
}

function cookieSerializationOptions(
	requestUrl: URL,
): Pick<Parameters<typeof serializeCookie>[0], 'httpOnly' | 'secure' | 'sameSite' | 'path'> {
	const secureCookie = requestUrl.protocol === 'https:' || environment.nodeEnv === 'production';
	return { httpOnly: true, secure: secureCookie, sameSite: 'Lax', path: '/' };
}

/**
 * Selects which existing `google_oauth_state_*` cookies to evict so the
 * cookie jar stays bounded (S-16: "concurrent login attempts share one
 * cookie name" is fixed by giving each attempt its own cookie, but that
 * alone lets an attacker or a stuck client grow the `Cookie` header without
 * bound). Cookies that fail to decode — tampered, foreign, or already
 * expired — are treated as the oldest and evicted first.
 */
function selectGoogleOauthStateCookiesToEvict(request: Request): string[] {
	const cookies = parseCookies(request.headers.get('cookie'));
	const entries: { name: string; expiresAt: number }[] = [];

	for (const [name, value] of cookies) {
		if (!name.startsWith(GOOGLE_OAUTH_STATE_COOKIE_PREFIX)) continue;
		const payload = decodeGoogleStatePayload(value);
		entries.push({ name, expiresAt: payload?.expiresAtEpochMilliseconds ?? 0 });
	}

	// A new cookie is about to be added, so cap at one less than the max.
	if (entries.length < googleOauthStateCookieMaxCount) return [];

	entries.sort((a, b) => a.expiresAt - b.expiresAt);
	return entries.slice(0, entries.length - googleOauthStateCookieMaxCount + 1).map((e) => e.name);
}

export function createGoogleSignInRedirectResponse(request: Request): Response {
	const requestUrl = new URL(request.url);
	const callbackPath = sanitizeCallbackPath(requestUrl.searchParams.get('callback_path'));
	const state = randomBytes(32).toString('hex');
	const nonce = randomBytes(32).toString('hex');
	const codeVerifier = generatePkceCodeVerifier();
	const codeChallenge = computePkceCodeChallengeS256(codeVerifier);
	const callbackUrl = `${getBaseUrl(request)}/auth/google/callback`;

	const googleAuthorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	googleAuthorizationUrl.searchParams.set('client_id', environment.googleClientId!);
	googleAuthorizationUrl.searchParams.set('redirect_uri', callbackUrl);
	googleAuthorizationUrl.searchParams.set('response_type', 'code');
	googleAuthorizationUrl.searchParams.set('scope', 'openid email profile');
	googleAuthorizationUrl.searchParams.set('state', state);
	googleAuthorizationUrl.searchParams.set('nonce', nonce);
	googleAuthorizationUrl.searchParams.set('code_challenge', codeChallenge);
	googleAuthorizationUrl.searchParams.set('code_challenge_method', 'S256');
	googleAuthorizationUrl.searchParams.set('prompt', 'select_account');

	const encodedState = encodeGoogleStatePayload({
		state,
		nonce,
		codeVerifier,
		callbackPath,
		expiresAtEpochMilliseconds: Date.now() + GOOGLE_OAUTH_STATE_TIME_TO_LIVE_SECONDS * 1000,
	});

	const cookieOptions = cookieSerializationOptions(requestUrl);
	const headers = new Headers({ Location: googleAuthorizationUrl.toString() });

	for (const cookieNameToEvict of selectGoogleOauthStateCookiesToEvict(request)) {
		headers.append(
			'Set-Cookie',
			serializeCookie({ name: cookieNameToEvict, value: '', maxAgeSeconds: 0, ...cookieOptions }),
		);
	}

	headers.append(
		'Set-Cookie',
		serializeCookie({
			name: googleOauthStateCookieName(state),
			value: encodedState,
			maxAgeSeconds: GOOGLE_OAUTH_STATE_TIME_TO_LIVE_SECONDS,
			...cookieOptions,
		}),
	);

	return new Response(null, { status: 302, headers });
}

/**
 * Derives the per-attempt cookie name from the callback's `state` query
 * parameter alone (before any signature or single-use check), so every
 * terminal path in the callback route — success or any error — can clear
 * the one cookie that attempt actually used. Returns `null` when there is
 * no well-formed `state` to derive a name from, in which case there is no
 * specific cookie this server can identify as belonging to this attempt.
 */
export function resolveGoogleOauthCallbackCookieName(request: Request): string | null {
	const state = new URL(request.url).searchParams.get('state');
	if (!state || !isValidGoogleOauthStateFormat(state)) return null;
	return googleOauthStateCookieName(state);
}

export function clearGoogleStateCookie(request: Request, cookieName: string): string {
	const requestUrl = new URL(request.url);
	return serializeCookie({
		name: cookieName,
		value: '',
		maxAgeSeconds: 0,
		...cookieSerializationOptions(requestUrl),
	});
}

export type GoogleCallbackStateValidation =
	| {
			valid: true;
			callbackPath: string;
			codeVerifier: string;
			nonce: string;
	  }
	| {
			valid: false;
			error: string;
	  };

export async function validateGoogleCallbackState(
	request: Request,
	dependencies: GoogleOauthSingleUseStoreDependencies | undefined = undefined,
): Promise<GoogleCallbackStateValidation> {
	const requestUrl = new URL(request.url);
	const state = requestUrl.searchParams.get('state');
	if (!state || !isValidGoogleOauthStateFormat(state)) {
		return { valid: false, error: 'Missing or malformed OAuth state.' };
	}

	const cookies = parseCookies(request.headers.get('cookie'));
	const cookieValue = cookies.get(googleOauthStateCookieName(state));
	if (!cookieValue) {
		return { valid: false, error: 'OAuth state cookie is missing.' };
	}

	const payload = decodeGoogleStatePayload(cookieValue);
	if (!payload) {
		return { valid: false, error: 'OAuth state cookie is invalid or expired.' };
	}

	if (!constantTimeEquals(payload.state, state)) {
		return { valid: false, error: 'OAuth state mismatch.' };
	}

	const claimed = await claimSingleUse(
		`google_oauth_state_used:${hashCredential(state)}`,
		GOOGLE_OAUTH_STATE_TIME_TO_LIVE_SECONDS * 1000,
		dependencies,
	);
	if (!claimed) {
		return { valid: false, error: 'OAuth state has already been used.' };
	}

	return {
		valid: true,
		callbackPath: sanitizeCallbackPath(payload.callbackPath),
		codeVerifier: payload.codeVerifier,
		nonce: payload.nonce,
	};
}

export async function exchangeGoogleCodeForTokens(
	request: Request,
	code: string,
	codeVerifier: string,
	dependencies: GoogleOutboundFetchDependencies = {},
): Promise<GoogleTokenExchangeResult> {
	const callbackUrl = `${getBaseUrl(request)}/auth/google/callback`;
	const body = new URLSearchParams({
		client_id: environment.googleClientId!,
		client_secret: environment.googleClientSecret!,
		code,
		grant_type: 'authorization_code',
		redirect_uri: callbackUrl,
		code_verifier: codeVerifier,
	});

	let status: number;
	let text: string;
	try {
		({ status, text } = await fetchGoogleEndpointBounded(
			GOOGLE_TOKEN_ENDPOINT,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					accept: 'application/json',
				},
				body,
				timeoutMs: googleTokenFetchTimeoutMs,
				expectedContentType: 'application/json',
				maxResponseBytes: googleTokenMaxResponseBytes,
				expectedHost: GOOGLE_TOKEN_ENDPOINT_HOST,
			},
			dependencies,
		));
	} catch {
		throw new Error('Failed to exchange OAuth code for access token.');
	}

	if (status < 200 || status >= 300) {
		throw new Error('Failed to exchange OAuth code for access token.');
	}

	let payload: GoogleTokenResponse;
	try {
		payload = JSON.parse(text) as GoogleTokenResponse;
	} catch {
		throw new Error('Google token response was not valid JSON.');
	}

	if (!payload.access_token || !payload.id_token) {
		throw new Error('Google token response did not include the expected tokens.');
	}

	return { accessToken: payload.access_token, idToken: payload.id_token };
}

export async function getGoogleUserProfile(
	accessToken: string,
	dependencies: GoogleOutboundFetchDependencies = {},
): Promise<GoogleUserProfile> {
	let status: number;
	let text: string;
	try {
		({ status, text } = await fetchGoogleEndpointBounded(
			GOOGLE_USERINFO_ENDPOINT,
			{
				method: 'GET',
				headers: { Authorization: `Bearer ${accessToken}`, accept: 'application/json' },
				timeoutMs: googleUserInfoFetchTimeoutMs,
				expectedContentType: 'application/json',
				maxResponseBytes: googleUserInfoMaxResponseBytes,
				expectedHost: GOOGLE_USERINFO_ENDPOINT_HOST,
			},
			dependencies,
		));
	} catch {
		throw new Error('Failed to fetch Google user profile.');
	}

	if (status < 200 || status >= 300) {
		throw new Error('Failed to fetch Google user profile.');
	}

	let payload: GoogleUserProfile;
	try {
		payload = JSON.parse(text) as GoogleUserProfile;
	} catch {
		throw new Error('Google user profile response was not valid JSON.');
	}

	if (!payload.sub || !payload.email || !payload.name) {
		throw new Error('Google user profile response was missing required fields.');
	}

	if (!payload.email_verified) {
		throw new Error('Google email must be verified for sign-in.');
	}

	return payload;
}
