import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, mock } from 'bun:test';

const SESSION_SIGNING_SECRET = 'a-very-secret-key-that-is-at-least-32-chars-long';

mock.module('@web/env', () => ({
	environment: {
		GOOGLE_CLIENT_ID: 'test-google-client-id',
		GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
		SESSION_SIGNING_SECRET,
		NODE_ENV: 'test',
		BASE_URL: undefined,
	},
}));

const {
	createGoogleSignInRedirectResponse,
	clearGoogleStateCookie,
	resolveGoogleOauthCallbackCookieName,
	validateGoogleCallbackState,
	exchangeGoogleCodeForTokens,
	getGoogleUserProfile,
} = await import('@web/lib/google-authentication');
const { resetGoogleOauthSingleUseStoreForTests } =
	await import('@web/lib/google-oauth-single-use-store');

beforeEach(() => {
	resetGoogleOauthSingleUseStoreForTests();
});

function extractSetCookies(response: Response): string[] {
	return response.headers.getSetCookie();
}

function extractCookiePair(setCookieHeader: string): { name: string; value: string } {
	const [pair] = setCookieHeader.split(';');
	const separatorIndex = pair!.indexOf('=');
	return { name: pair!.slice(0, separatorIndex), value: pair!.slice(separatorIndex + 1) };
}

describe('createGoogleSignInRedirectResponse', () => {
	it('returns a 302 redirect', () => {
		const request = new Request('http://localhost:3000/auth/google/start');
		const response = createGoogleSignInRedirectResponse(request);
		expect(response.status).toBe(302);
	});

	it('redirects to Google accounts', () => {
		const request = new Request('http://localhost:3000/auth/google/start');
		const response = createGoogleSignInRedirectResponse(request);
		const location = response.headers.get('Location')!;
		expect(location).toContain('accounts.google.com');
	});

	it('includes the correct query params, PKCE S256 challenge, and a nonce', () => {
		const request = new Request('http://localhost:3000/auth/google/start');
		const response = createGoogleSignInRedirectResponse(request);
		const location = new URL(response.headers.get('Location')!);
		expect(location.searchParams.get('client_id')).toBe('test-google-client-id');
		expect(location.searchParams.get('response_type')).toBe('code');
		expect(location.searchParams.get('scope')).toBe('openid email profile');
		expect(location.searchParams.get('code_challenge_method')).toBe('S256');
		expect(/^[A-Za-z0-9_-]{43}$/.test(location.searchParams.get('code_challenge')!)).toBe(true);
		expect(/^[0-9a-f]{64}$/.test(location.searchParams.get('nonce')!)).toBe(true);
		expect(/^[0-9a-f]{64}$/.test(location.searchParams.get('state')!)).toBe(true);
	});

	it('sets a state cookie named after this attempt', () => {
		const request = new Request('http://localhost:3000/auth/google/start');
		const response = createGoogleSignInRedirectResponse(request);
		const location = new URL(response.headers.get('Location')!);
		const state = location.searchParams.get('state')!;
		const setCookie = extractSetCookies(response).find((cookie) =>
			cookie.startsWith(`google_oauth_state_${state.slice(0, 16)}=`),
		);
		expect(setCookie).toBeDefined();
		expect(setCookie).toContain('HttpOnly');
	});

	it('gives two concurrent sign-in attempts independent cookies', () => {
		const firstResponse = createGoogleSignInRedirectResponse(
			new Request('http://localhost:3000/auth/google/start'),
		);
		const secondResponse = createGoogleSignInRedirectResponse(
			new Request('http://localhost:3000/auth/google/start'),
		);

		const firstState = new URL(firstResponse.headers.get('Location')!).searchParams.get('state')!;
		const secondState = new URL(secondResponse.headers.get('Location')!).searchParams.get('state')!;
		expect(firstState).not.toBe(secondState);

		const firstCookieName = extractCookiePair(extractSetCookies(firstResponse)[0]!).name;
		const secondCookieName = extractCookiePair(extractSetCookies(secondResponse)[0]!).name;
		expect(firstCookieName).not.toBe(secondCookieName);
	});

	it('evicts the oldest pending attempt once the cookie jar cap is reached', () => {
		let cookieHeader = '';
		const states: string[] = [];

		for (let attempt = 0; attempt < 6; attempt += 1) {
			const request = new Request('http://localhost:3000/auth/google/start', {
				headers: cookieHeader ? { cookie: cookieHeader } : {},
			});
			const response = createGoogleSignInRedirectResponse(request);
			const state = new URL(response.headers.get('Location')!).searchParams.get('state')!;
			states.push(state);

			const existingCookies = new Map(
				cookieHeader
					.split('; ')
					.filter(Boolean)
					.map((entry) => {
						const separatorIndex = entry.indexOf('=');
						return [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)] as const;
					}),
			);
			for (const setCookie of extractSetCookies(response)) {
				const { name, value } = extractCookiePair(setCookie);
				if (setCookie.includes('Max-Age=0')) {
					existingCookies.delete(name);
				} else {
					existingCookies.set(name, value);
				}
			}
			cookieHeader = Array.from(existingCookies, ([name, value]) => `${name}=${value}`).join('; ');
		}

		// The cap is 5; six attempts were made, so the first attempt's cookie
		// must have been evicted while the most recent one survives.
		expect(cookieHeader).not.toContain(`google_oauth_state_${states[0]!.slice(0, 16)}`);
		expect(cookieHeader).toContain(`google_oauth_state_${states[5]!.slice(0, 16)}`);
	});
});

describe('resolveGoogleOauthCallbackCookieName', () => {
	it('returns null when state is missing', () => {
		const request = new Request('http://localhost:3000/auth/google/callback');
		expect(resolveGoogleOauthCallbackCookieName(request)).toBeNull();
	});

	it('returns null when state is not well-formed hex', () => {
		const request = new Request('http://localhost:3000/auth/google/callback?state=not-hex!!');
		expect(resolveGoogleOauthCallbackCookieName(request)).toBeNull();
	});

	it('derives the cookie name from a well-formed state', () => {
		const state = 'a'.repeat(64);
		const request = new Request(`http://localhost:3000/auth/google/callback?state=${state}`);
		expect(resolveGoogleOauthCallbackCookieName(request)).toBe(
			`google_oauth_state_${state.slice(0, 16)}`,
		);
	});
});

describe('clearGoogleStateCookie', () => {
	it('returns a cookie string that clears the named cookie', () => {
		const request = new Request('http://localhost:3000/auth/google/callback');
		const cookie = clearGoogleStateCookie(request, 'google_oauth_state_abcdef0123456789');
		expect(cookie).toContain('google_oauth_state_abcdef0123456789');
		expect(cookie).toContain('Max-Age=0');
	});
});

describe('validateGoogleCallbackState', () => {
	function startAndGetCookie(callbackPath?: string): {
		state: string;
		cookieName: string;
		cookieValue: string;
	} {
		const startUrl = callbackPath
			? `http://localhost:3000/auth/google/start?callback_path=${callbackPath}`
			: 'http://localhost:3000/auth/google/start';
		const response = createGoogleSignInRedirectResponse(new Request(startUrl));
		const location = new URL(response.headers.get('Location')!);
		const state = location.searchParams.get('state')!;
		const setCookie = extractSetCookies(response)[0]!;
		const { name, value } = extractCookiePair(setCookie);
		return { state, cookieName: name, cookieValue: value };
	}

	it('returns invalid when state query param is missing', async () => {
		const request = new Request('http://localhost:3000/auth/google/callback');
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('state');
		}
	});

	it('returns invalid when state is not well-formed hex', async () => {
		const request = new Request('http://localhost:3000/auth/google/callback?state=not-hex');
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
	});

	it('returns invalid when the matching state cookie is missing', async () => {
		const state = 'b'.repeat(64);
		const request = new Request(`http://localhost:3000/auth/google/callback?state=${state}`);
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('cookie');
		}
	});

	it('returns invalid when the cookie value is tampered', async () => {
		const { state, cookieName } = startAndGetCookie();
		const request = new Request(`http://localhost:3000/auth/google/callback?state=${state}`, {
			headers: { cookie: `${cookieName}=tampered-value` },
		});
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
	});

	it('validates a round-trip state, exposing the code verifier, nonce, and callback path', async () => {
		const { state, cookieName, cookieValue } = startAndGetCookie('/dashboard');
		const request = new Request(
			`http://localhost:3000/auth/google/callback?state=${state}&code=test-code`,
			{ headers: { cookie: `${cookieName}=${cookieValue}` } },
		);

		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.callbackPath).toBe('/dashboard');
			expect(/^[A-Za-z0-9\-._~]{43,128}$/.test(result.codeVerifier)).toBe(true);
			expect(/^[0-9a-f]{64}$/.test(result.nonce)).toBe(true);
		}
	});

	it('sanitizes a protocol-relative callback path (//host) back to "/"', async () => {
		const { state, cookieName, cookieValue } = startAndGetCookie('%2F%2Fevil.example.com');
		const request = new Request(
			`http://localhost:3000/auth/google/callback?state=${state}&code=test-code`,
			{ headers: { cookie: `${cookieName}=${cookieValue}` } },
		);

		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.callbackPath).toBe('/');
		}
	});

	it('rejects replaying the same state a second time', async () => {
		const { state, cookieName, cookieValue } = startAndGetCookie();
		const cookieHeader = { headers: { cookie: `${cookieName}=${cookieValue}` } };

		const first = await validateGoogleCallbackState(
			new Request(`http://localhost:3000/auth/google/callback?state=${state}`, cookieHeader),
		);
		expect(first.valid).toBe(true);

		const second = await validateGoogleCallbackState(
			new Request(`http://localhost:3000/auth/google/callback?state=${state}`, cookieHeader),
		);
		expect(second.valid).toBe(false);
		if (!second.valid) {
			expect(second.error).toContain('already been used');
		}
	});

	it('lets two concurrent tabs validate their own state independently', async () => {
		const first = startAndGetCookie();
		const second = startAndGetCookie();

		const firstResult = await validateGoogleCallbackState(
			new Request(`http://localhost:3000/auth/google/callback?state=${first.state}`, {
				headers: { cookie: `${first.cookieName}=${first.cookieValue}` },
			}),
		);
		const secondResult = await validateGoogleCallbackState(
			new Request(`http://localhost:3000/auth/google/callback?state=${second.state}`, {
				headers: { cookie: `${second.cookieName}=${second.cookieValue}` },
			}),
		);

		expect(firstResult.valid).toBe(true);
		expect(secondResult.valid).toBe(true);
	});
});

// The following cases hand-craft a signed `google_oauth_state_*` cookie
// value using the same HMAC scheme `encodeGoogleStatePayload` uses
// internally, so they can drive `decodeGoogleStatePayload` branches that
// `createGoogleSignInRedirectResponse` itself never produces (a payload
// missing a field, an out-of-format inner `state`/`codeVerifier`, an
// already-expired payload, or a `state` mismatch between the payload and
// the query string).
function signRawPayload(payload: Record<string, unknown>): string {
	const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
	const signature = createHmac('sha256', SESSION_SIGNING_SECRET)
		.update(payloadBase64)
		.digest('base64url');
	return `${payloadBase64}.${signature}`;
}

const validHexState = 'c'.repeat(64);
const validHexNonce = 'd'.repeat(64);
const validCodeVerifier = 'e'.repeat(43);

function cookieNameFor(state: string): string {
	return `google_oauth_state_${state.slice(0, 16)}`;
}

describe('validateGoogleCallbackState (hand-crafted cookie payloads)', () => {
	it('rejects a payload missing a required field', async () => {
		const cookieValue = signRawPayload({
			state: validHexState,
			// nonce intentionally omitted
			codeVerifier: validCodeVerifier,
			callbackPath: '/',
			expiresAtEpochMilliseconds: Date.now() + 60_000,
		});
		const request = new Request(
			`http://localhost:3000/auth/google/callback?state=${validHexState}`,
			{ headers: { cookie: `${cookieNameFor(validHexState)}=${cookieValue}` } },
		);
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('cookie');
		}
	});

	it('rejects a payload whose inner state is not well-formed hex', async () => {
		const cookieValue = signRawPayload({
			state: 'not-hex-at-all',
			nonce: validHexNonce,
			codeVerifier: validCodeVerifier,
			callbackPath: '/',
			expiresAtEpochMilliseconds: Date.now() + 60_000,
		});
		const request = new Request(
			`http://localhost:3000/auth/google/callback?state=${validHexState}`,
			{ headers: { cookie: `${cookieNameFor(validHexState)}=${cookieValue}` } },
		);
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
	});

	it('rejects a payload with an invalid PKCE code verifier', async () => {
		const cookieValue = signRawPayload({
			state: validHexState,
			nonce: validHexNonce,
			codeVerifier: 'too-short',
			callbackPath: '/',
			expiresAtEpochMilliseconds: Date.now() + 60_000,
		});
		const request = new Request(
			`http://localhost:3000/auth/google/callback?state=${validHexState}`,
			{ headers: { cookie: `${cookieNameFor(validHexState)}=${cookieValue}` } },
		);
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
	});

	it('rejects an already-expired payload', async () => {
		const cookieValue = signRawPayload({
			state: validHexState,
			nonce: validHexNonce,
			codeVerifier: validCodeVerifier,
			callbackPath: '/',
			expiresAtEpochMilliseconds: Date.now() - 1_000,
		});
		const request = new Request(
			`http://localhost:3000/auth/google/callback?state=${validHexState}`,
			{ headers: { cookie: `${cookieNameFor(validHexState)}=${cookieValue}` } },
		);
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('cookie');
		}
	});

	it('rejects a payload whose JSON body does not parse', async () => {
		const payloadBase64 = Buffer.from('not-json', 'utf-8').toString('base64url');
		const signature = createHmac('sha256', SESSION_SIGNING_SECRET)
			.update(payloadBase64)
			.digest('base64url');
		const cookieValue = `${payloadBase64}.${signature}`;
		const request = new Request(
			`http://localhost:3000/auth/google/callback?state=${validHexState}`,
			{ headers: { cookie: `${cookieNameFor(validHexState)}=${cookieValue}` } },
		);
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
	});

	it('rejects when the decoded payload state does not match the query state', async () => {
		const otherHexState = 'f'.repeat(64);
		const cookieValue = signRawPayload({
			state: otherHexState,
			nonce: validHexNonce,
			codeVerifier: validCodeVerifier,
			callbackPath: '/',
			expiresAtEpochMilliseconds: Date.now() + 60_000,
		});
		// The cookie is stored under the name derived from the query state
		// (what a real client would send back), but its signed payload
		// claims a different `state` value.
		const request = new Request(
			`http://localhost:3000/auth/google/callback?state=${validHexState}`,
			{ headers: { cookie: `${cookieNameFor(validHexState)}=${cookieValue}` } },
		);
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('mismatch');
		}
	});

	it('rejects a payload whose signature does not match its body (tampered cookie)', async () => {
		const cookieValue = signRawPayload({
			state: validHexState,
			nonce: validHexNonce,
			codeVerifier: validCodeVerifier,
			callbackPath: '/',
			expiresAtEpochMilliseconds: Date.now() + 60_000,
		});
		// Flip the last character of the signature -- the payload body is
		// still well-formed JSON with every required field, but the HMAC no
		// longer matches it. Exercises `isValidSignature`'s rejection branch
		// directly, distinct from every other case above (a missing field,
		// bad hex, an expired timestamp, unparseable JSON) which all use a
		// correctly-signed payload.
		const [payloadBase64, signature] = cookieValue.split('.');
		const tamperedLastChar = signature!.at(-1) === 'a' ? 'b' : 'a';
		const tamperedCookieValue = `${payloadBase64}.${signature!.slice(0, -1)}${tamperedLastChar}`;
		const request = new Request(
			`http://localhost:3000/auth/google/callback?state=${validHexState}`,
			{ headers: { cookie: `${cookieNameFor(validHexState)}=${tamperedCookieValue}` } },
		);
		const result = await validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
	});
});

describe('exchangeGoogleCodeForTokens', () => {
	const request = new Request('http://localhost:3000/auth/google/callback');

	it('returns the access token and ID token on a successful exchange', async () => {
		const fetchImpl = mock(
			async () =>
				new Response(JSON.stringify({ access_token: 'access-123', id_token: 'id-456' }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		);
		const result = await exchangeGoogleCodeForTokens(request, 'test-code', 'test-verifier', {
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(result).toEqual({ accessToken: 'access-123', idToken: 'id-456' });
	});

	it('throws when the underlying fetch fails', async () => {
		const fetchImpl = mock(async () => {
			throw new Error('network down');
		});
		await expect(
			exchangeGoogleCodeForTokens(request, 'test-code', 'test-verifier', {
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow('Failed to exchange OAuth code for access token.');
	});

	it('throws when Google responds with a non-2xx status', async () => {
		const fetchImpl = mock(
			async () =>
				new Response(JSON.stringify({ error: 'invalid_grant' }), {
					status: 400,
					headers: { 'content-type': 'application/json' },
				}),
		);
		await expect(
			exchangeGoogleCodeForTokens(request, 'test-code', 'test-verifier', {
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow('Failed to exchange OAuth code for access token.');
	});

	it('throws when the response body is not valid JSON', async () => {
		const fetchImpl = mock(
			async () =>
				new Response('not-json', {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		);
		await expect(
			exchangeGoogleCodeForTokens(request, 'test-code', 'test-verifier', {
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow('Google token response was not valid JSON.');
	});

	it('throws when the response is missing an access token or ID token', async () => {
		const fetchImpl = mock(
			async () =>
				new Response(JSON.stringify({ token_type: 'Bearer' }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		);
		await expect(
			exchangeGoogleCodeForTokens(request, 'test-code', 'test-verifier', {
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow('Google token response did not include the expected tokens.');
	});
});

describe('getGoogleUserProfile', () => {
	it('returns the profile on success', async () => {
		const fetchImpl = mock(
			async () =>
				new Response(
					JSON.stringify({
						sub: 'google-sub-1',
						email: 'person@example.com',
						email_verified: true,
						name: 'Person',
						picture: 'https://example.com/pic.jpg',
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } },
				),
		);
		const profile = await getGoogleUserProfile('access-token', {
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(profile.sub).toBe('google-sub-1');
		expect(profile.email).toBe('person@example.com');
	});

	it('throws when the underlying fetch fails', async () => {
		const fetchImpl = mock(async () => {
			throw new Error('network down');
		});
		await expect(
			getGoogleUserProfile('access-token', { fetchImpl: fetchImpl as unknown as typeof fetch }),
		).rejects.toThrow('Failed to fetch Google user profile.');
	});

	it('throws when Google responds with a non-2xx status', async () => {
		const fetchImpl = mock(
			async () =>
				new Response(JSON.stringify({ error: 'invalid_token' }), {
					status: 401,
					headers: { 'content-type': 'application/json' },
				}),
		);
		await expect(
			getGoogleUserProfile('access-token', { fetchImpl: fetchImpl as unknown as typeof fetch }),
		).rejects.toThrow('Failed to fetch Google user profile.');
	});

	it('throws when the response body is not valid JSON', async () => {
		const fetchImpl = mock(
			async () =>
				new Response('not-json', {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		);
		await expect(
			getGoogleUserProfile('access-token', { fetchImpl: fetchImpl as unknown as typeof fetch }),
		).rejects.toThrow('Google user profile response was not valid JSON.');
	});

	it('throws when required fields are missing', async () => {
		const fetchImpl = mock(
			async () =>
				new Response(JSON.stringify({ sub: 'google-sub-1', email_verified: true }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		);
		await expect(
			getGoogleUserProfile('access-token', { fetchImpl: fetchImpl as unknown as typeof fetch }),
		).rejects.toThrow('Google user profile response was missing required fields.');
	});

	it('throws when the email is not verified', async () => {
		const fetchImpl = mock(
			async () =>
				new Response(
					JSON.stringify({
						sub: 'google-sub-1',
						email: 'person@example.com',
						email_verified: false,
						name: 'Person',
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } },
				),
		);
		await expect(
			getGoogleUserProfile('access-token', { fetchImpl: fetchImpl as unknown as typeof fetch }),
		).rejects.toThrow('Google email must be verified for sign-in.');
	});
});
