import { describe, expect, it, mock } from 'bun:test';

mock.module('@web/env', () => ({
	environment: {
		GOOGLE_CLIENT_ID: 'test-google-client-id',
		GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
		SESSION_SIGNING_SECRET: 'a-very-secret-key-that-is-at-least-32-chars-long',
		NODE_ENV: 'test',
		BASE_URL: undefined,
	},
}));

const { createGoogleSignInRedirectResponse, clearGoogleStateCookie, validateGoogleCallbackState } =
	await import('@web/lib/google-authentication');

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

	it('includes the correct query params', () => {
		const request = new Request('http://localhost:3000/auth/google/start');
		const response = createGoogleSignInRedirectResponse(request);
		const location = response.headers.get('Location')!;
		expect(location).toContain('client_id=test-google-client-id');
		expect(location).toContain('response_type=code');
		expect(location).toContain('scope=openid+email+profile');
	});

	it('sets the state cookie', () => {
		const request = new Request('http://localhost:3000/auth/google/start');
		const response = createGoogleSignInRedirectResponse(request);
		const setCookie = response.headers.get('Set-Cookie')!;
		expect(setCookie).toContain('google_oauth_state');
		expect(setCookie).toContain('HttpOnly');
	});
});

describe('clearGoogleStateCookie', () => {
	it('returns a cookie string that clears the state cookie', () => {
		const request = new Request('http://localhost:3000/auth/google/callback');
		const cookie = clearGoogleStateCookie(request);
		expect(cookie).toContain('google_oauth_state');
		expect(cookie).toContain('Max-Age=0');
	});
});

describe('validateGoogleCallbackState', () => {
	it('returns invalid when state query param is missing', () => {
		const request = new Request('http://localhost:3000/auth/google/callback');
		const result = validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('Missing');
		}
	});

	it('returns invalid when state cookie is missing', () => {
		const request = new Request('http://localhost:3000/auth/google/callback?state=abc');
		const result = validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('cookie');
		}
	});

	it('returns invalid when cookie value is tampered', () => {
		const request = new Request('http://localhost:3000/auth/google/callback?state=abc', {
			headers: { cookie: 'google_oauth_state=tampered-value' },
		});
		const result = validateGoogleCallbackState(request);
		expect(result.valid).toBe(false);
	});

	it('validates a round-trip state correctly', () => {
		const startRequest = new Request(
			'http://localhost:3000/auth/google/start?callback_path=/dashboard',
		);
		const redirectResponse = createGoogleSignInRedirectResponse(startRequest);
		const setCookie = redirectResponse.headers.get('Set-Cookie')!;

		const location = new URL(redirectResponse.headers.get('Location')!);
		const state = location.searchParams.get('state')!;

		const cookieValue = setCookie.split(';')[0].split('=').slice(1).join('=');

		const callbackRequest = new Request(
			`http://localhost:3000/auth/google/callback?state=${state}&code=test-code`,
			{
				headers: {
					cookie: `google_oauth_state=${cookieValue}`,
				},
			},
		);

		const result = validateGoogleCallbackState(callbackRequest);
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.callbackPath).toBe('/dashboard');
		}
	});
});
