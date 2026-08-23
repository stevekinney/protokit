import { beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('@web/env', () => ({
	environment: {
		GOOGLE_CLIENT_ID: 'test-google-client-id',
		GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
		SESSION_SIGNING_SECRET: 'a-very-secret-key-that-is-at-least-32-chars-long',
		NODE_ENV: 'test',
		BASE_URL: undefined,
	},
}));

const {
	createGoogleSignInRedirectResponse,
	clearGoogleStateCookie,
	resolveGoogleOauthCallbackCookieName,
	validateGoogleCallbackState,
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
