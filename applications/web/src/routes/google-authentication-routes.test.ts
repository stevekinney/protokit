import { beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('@web/env', () => ({
	environment: {
		GOOGLE_CLIENT_ID: 'test-google-client-id',
		GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
		SESSION_SIGNING_SECRET: 'a-very-secret-key-that-is-at-least-32-chars-long',
		SESSION_COOKIE_NAME: 'test_session',
		SESSION_TIME_TO_LIVE_SECONDS: 3600,
		NODE_ENV: 'test',
		BASE_URL: undefined,
	},
}));

mock.module('@web/lib/google-authentication', () => ({
	createGoogleSignInRedirectResponse: () =>
		new Response(null, {
			status: 302,
			headers: { Location: 'https://accounts.google.com/o/oauth2/v2/auth' },
		}),
	exchangeGoogleCodeForTokens: async () => ({
		accessToken: 'mock-access-token',
		idToken: 'mock-id-token',
	}),
	getGoogleUserProfile: async () => ({
		sub: 'google-sub-123',
		email: 'alice@example.com',
		email_verified: true,
		name: 'Alice',
		picture: 'https://example.com/photo.jpg',
	}),
	resolveGoogleOauthCallbackCookieName: (request: Request) => {
		const url = new URL(request.url);
		const state = url.searchParams.get('state');
		return state ? `google_oauth_state_${state}` : null;
	},
	validateGoogleCallbackState: async (request: Request) => {
		const url = new URL(request.url);
		if (!url.searchParams.get('state')) {
			return { valid: false, error: 'Missing OAuth state.' };
		}
		return {
			valid: true,
			callbackPath: '/',
			codeVerifier: 'mock-code-verifier-mock-code-verifier-mock-1',
			nonce: 'mock-nonce',
		};
	},
	clearGoogleStateCookie: (_request: Request, cookieName: string) => `${cookieName}=; Max-Age=0`,
}));

mock.module('@web/lib/google-id-token', () => ({
	validateGoogleIdToken: async () => ({
		sub: 'google-sub-123',
		email: 'alice@example.com',
		email_verified: true,
		name: 'Alice',
		picture: 'https://example.com/photo.jpg',
	}),
}));

export const recordFailedAuthenticationSpy = mock(async () => {});

mock.module('@web/lib/request-rate-limiter', () => ({
	enforceGoogleAuthRateLimit: async () => ({
		allowed: true,
		retryAfterSeconds: 0,
		remainingRequests: 10,
	}),
	enforceSessionCreationRateLimit: async () => ({
		allowed: true,
		retryAfterSeconds: 0,
		remainingRequests: 10,
	}),
	recordFailedAuthentication: recordFailedAuthenticationSpy,
}));

mock.module('@web/lib/session-authentication', () => ({
	createSession: async () => ({
		cookieHeaderValue: 'test_session=token; HttpOnly',
		sessionToken: 'mock-session-token',
	}),
	revokeSession: async () => {},
	createExpiredSessionCookie: () => 'test_session=; Max-Age=0',
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve([]),
				}),
			}),
		}),
		insert: () => ({
			values: (row: { id?: string }) =>
				Object.assign(Promise.resolve(undefined), {
					onConflictDoNothing: () => ({
						returning: async () => [{ id: row.id }],
					}),
				}),
		}),
		update: () => ({
			set: () => ({
				where: async () => {},
			}),
		}),
		delete: () => ({
			where: async () => {},
		}),
	},
	schema: {
		users: { id: 'id', email: 'email' },
		userGoogleAccounts: { googleSubject: 'googleSubject', userId: 'userId' },
	},
}));

mock.module('drizzle-orm', () => ({
	eq: (column: unknown, value: unknown) => ({ column, value }),
}));

const { handleGoogleSignInStart, handleGoogleSignInCallback, handleSignOut } =
	await import('@web/routes/google-authentication-routes');
const { deriveSessionCsrfToken } = await import('@web/lib/csrf-protection');

import type { RequestContext } from '@web/lib/request-context';

function createContext(
	overrides: Partial<{
		url: string;
		method: string;
		headers: Record<string, string>;
		body: string;
		sessionToken: string | null;
	}> = {},
): RequestContext {
	const url = overrides.url ?? 'http://localhost:3000/auth/google/start';
	const request = new Request(url, {
		method: overrides.method ?? 'GET',
		headers: overrides.headers,
		body: overrides.body,
	});
	return {
		request,
		requestUrl: new URL(url),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: null,
		sessionToken: overrides.sessionToken ?? null,
	};
}

describe('handleGoogleSignInStart', () => {
	it('returns a 302 redirect', async () => {
		const context = createContext();
		const response = await handleGoogleSignInStart(context);
		expect(response.status).toBe(302);
	});
});

describe('handleGoogleSignInCallback', () => {
	beforeEach(() => {
		recordFailedAuthenticationSpy.mockClear();
	});

	it('returns 400 when code is missing', async () => {
		const context = createContext({ url: 'http://localhost:3000/auth/google/callback' });
		const response = await handleGoogleSignInCallback(context);
		expect(response.status).toBe(400);
	});

	it('returns 400 when state is invalid', async () => {
		const context = createContext({
			url: 'http://localhost:3000/auth/google/callback?code=test-code',
		});
		const response = await handleGoogleSignInCallback(context);
		expect(response.status).toBe(400);
	});

	it('does not record a missing/malformed state toward the shared failed-authentication lockout', async () => {
		// Regression for a round-3 review finding (P2): a malformed/missing/cookie-less `state`
		// never checks a credential (no client secret is compared here, unlike
		// `handleOauthTokenPost`/`handleOauthRevokePost`'s `authenticateOauthClient`), so it must
		// not poison the shared network-wide lockout that guards those routes and `/mcp`. This
		// route already has its own rate limit (`enforceGoogleAuthRateLimit`, mocked above).
		const context = createContext({
			url: 'http://localhost:3000/auth/google/callback?code=test-code',
		});
		const response = await handleGoogleSignInCallback(context);

		expect(response.status).toBe(400);
		expect(recordFailedAuthenticationSpy).not.toHaveBeenCalled();
	});

	it('creates session and redirects on success', async () => {
		const context = createContext({
			url: 'http://localhost:3000/auth/google/callback?code=test-code&state=valid-state',
		});
		const response = await handleGoogleSignInCallback(context);
		expect(response.status).toBe(302);
		const cookies = response.headers.getSetCookie();
		expect(cookies.length).toBeGreaterThan(0);
	});
});

describe('handleSignOut', () => {
	function createSignOutContext(): RequestContext {
		const csrfToken = deriveSessionCsrfToken('mock-token');
		return createContext({
			url: 'http://localhost:3000/auth/sign-out',
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'same-origin',
			},
			body: new URLSearchParams({ csrf_token: csrfToken }).toString(),
			sessionToken: 'mock-token',
		});
	}

	it('returns a 303 redirect to /', async () => {
		const response = await handleSignOut(createSignOutContext());
		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe('/');
	});

	it('sets an expired session cookie', async () => {
		const response = await handleSignOut(createSignOutContext());
		const cookies = response.headers.getSetCookie();
		expect(cookies.some((c: string) => c.includes('Max-Age=0'))).toBe(true);
	});

	it('rejects a cross-site sign-out request without revoking the session', async () => {
		const csrfToken = deriveSessionCsrfToken('mock-token');
		const context = createContext({
			url: 'http://localhost:3000/auth/sign-out',
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'cross-site',
			},
			body: new URLSearchParams({ csrf_token: csrfToken }).toString(),
			sessionToken: 'mock-token',
		});
		const response = await handleSignOut(context);
		expect(response.status).toBe(403);
	});

	it('rejects a missing or invalid CSRF token', async () => {
		const context = createContext({
			url: 'http://localhost:3000/auth/sign-out',
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'same-origin',
			},
			body: new URLSearchParams({ csrf_token: 'wrong-token' }).toString(),
			sessionToken: 'mock-token',
		});
		const response = await handleSignOut(context);
		expect(response.status).toBe(403);
	});

	it('redirects without requiring CSRF checks when there is no session to protect', async () => {
		const context = createContext({
			url: 'http://localhost:3000/auth/sign-out',
			method: 'POST',
			sessionToken: null,
		});
		const response = await handleSignOut(context);
		expect(response.status).toBe(303);
	});
});
