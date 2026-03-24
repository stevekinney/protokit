import { createHmac, randomBytes } from 'node:crypto';
import { environment } from '@web/env';
import { constantTimeEquals } from '@web/lib/constant-time-equals';
import { parseCookies, serializeCookie } from '@web/lib/cookies';
import { getBaseUrl } from '@web/lib/base-url';
import { sessionSigningSecret } from '@web/lib/session-signing-secret';

const GOOGLE_OAUTH_STATE_COOKIE_NAME = 'google_oauth_state';
const GOOGLE_OAUTH_STATE_TIME_TO_LIVE_SECONDS = 10 * 60;

type GoogleOauthCookiePayload = {
	state: string;
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

function sanitizeCallbackPath(value: string | null): string {
	if (!value || !value.startsWith('/')) {
		return '/';
	}

	if (value.startsWith('//') || value.startsWith('/\\')) {
		return '/';
	}

	return value;
}

function createSignature(payload: string): string {
	return createHmac('sha256', sessionSigningSecret).update(payload).digest('base64url');
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
	const expectedSignature = createSignature(payloadBase64);

	if (!constantTimeEquals(signature, expectedSignature)) {
		return null;
	}

	try {
		const serializedPayload = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
		const payload = JSON.parse(serializedPayload) as GoogleOauthCookiePayload;
		if (!payload.state || !payload.callbackPath || !payload.expiresAtEpochMilliseconds) {
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

export function createGoogleSignInRedirectResponse(request: Request): Response {
	const requestUrl = new URL(request.url);
	const callbackPath = sanitizeCallbackPath(requestUrl.searchParams.get('callback_path'));
	const state = randomBytes(32).toString('hex');
	const callbackUrl = `${getBaseUrl(request)}/auth/google/callback`;

	const googleAuthorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	googleAuthorizationUrl.searchParams.set('client_id', environment.GOOGLE_CLIENT_ID!);
	googleAuthorizationUrl.searchParams.set('redirect_uri', callbackUrl);
	googleAuthorizationUrl.searchParams.set('response_type', 'code');
	googleAuthorizationUrl.searchParams.set('scope', 'openid email profile');
	googleAuthorizationUrl.searchParams.set('state', state);
	googleAuthorizationUrl.searchParams.set('prompt', 'select_account');

	const encodedState = encodeGoogleStatePayload({
		state,
		callbackPath,
		expiresAtEpochMilliseconds: Date.now() + GOOGLE_OAUTH_STATE_TIME_TO_LIVE_SECONDS * 1000,
	});

	const secureCookie = requestUrl.protocol === 'https:' || environment.NODE_ENV === 'production';
	const cookieHeaderValue = serializeCookie({
		name: GOOGLE_OAUTH_STATE_COOKIE_NAME,
		value: encodedState,
		maxAgeSeconds: GOOGLE_OAUTH_STATE_TIME_TO_LIVE_SECONDS,
		httpOnly: true,
		secure: secureCookie,
		sameSite: 'Lax',
		path: '/',
	});

	return new Response(null, {
		status: 302,
		headers: {
			Location: googleAuthorizationUrl.toString(),
			'Set-Cookie': cookieHeaderValue,
		},
	});
}

export function clearGoogleStateCookie(request: Request): string {
	const requestUrl = new URL(request.url);
	const secureCookie = requestUrl.protocol === 'https:' || environment.NODE_ENV === 'production';
	return serializeCookie({
		name: GOOGLE_OAUTH_STATE_COOKIE_NAME,
		value: '',
		maxAgeSeconds: 0,
		httpOnly: true,
		secure: secureCookie,
		sameSite: 'Lax',
		path: '/',
	});
}

export function validateGoogleCallbackState(request: Request):
	| {
			valid: true;
			callbackPath: string;
	  }
	| {
			valid: false;
			error: string;
	  } {
	const requestUrl = new URL(request.url);
	const state = requestUrl.searchParams.get('state');
	if (!state) {
		return { valid: false, error: 'Missing OAuth state.' };
	}

	const cookies = parseCookies(request.headers.get('cookie'));
	const cookieValue = cookies.get(GOOGLE_OAUTH_STATE_COOKIE_NAME);
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

	return { valid: true, callbackPath: sanitizeCallbackPath(payload.callbackPath) };
}

export async function exchangeGoogleCodeForAccessToken(
	request: Request,
	code: string,
): Promise<string> {
	const callbackUrl = `${getBaseUrl(request)}/auth/google/callback`;
	const body = new URLSearchParams({
		client_id: environment.GOOGLE_CLIENT_ID!,
		client_secret: environment.GOOGLE_CLIENT_SECRET!,
		code,
		grant_type: 'authorization_code',
		redirect_uri: callbackUrl,
	});

	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body,
	});

	if (!response.ok) {
		throw new Error('Failed to exchange OAuth code for access token.');
	}

	const payload = (await response.json()) as GoogleTokenResponse;
	if (!payload.access_token) {
		throw new Error('Google token response did not include an access token.');
	}

	return payload.access_token;
}

export async function getGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile> {
	const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error('Failed to fetch Google user profile.');
	}

	const payload = (await response.json()) as GoogleUserProfile;
	if (!payload.sub || !payload.email || !payload.name) {
		throw new Error('Google user profile response was missing required fields.');
	}

	if (!payload.email_verified) {
		throw new Error('Google email must be verified for sign-in.');
	}

	return payload;
}
