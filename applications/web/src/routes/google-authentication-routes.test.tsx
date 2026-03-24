import { describe, expect, it, mock } from 'bun:test';

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
	exchangeGoogleCodeForAccessToken: async () => 'mock-access-token',
	getGoogleUserProfile: async () => ({
		sub: 'google-sub-123',
		email: 'alice@example.com',
		email_verified: true,
		name: 'Alice',
		picture: 'https://example.com/photo.jpg',
	}),
	validateGoogleCallbackState: (request: Request) => {
		const url = new URL(request.url);
		if (!url.searchParams.get('state')) {
			return { valid: false, error: 'Missing OAuth state.' };
		}
		return { valid: true, callbackPath: '/' };
	},
	clearGoogleStateCookie: () => 'google_oauth_state=; Max-Age=0',
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
			values: async () => {},
		}),
		update: () => ({
			set: () => ({
				where: async () => {},
			}),
		}),
		transaction: async (callback: (tx: unknown) => Promise<void>) => {
			const tx = {
				insert: () => ({ values: async () => {} }),
			};
			await callback(tx);
		},
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

import type { RequestContext } from '@web/lib/request-context';

function createContext(
	overrides: Partial<{
		url: string;
		method: string;
		sessionToken: string | null;
	}> = {},
): RequestContext {
	const url = overrides.url ?? 'http://localhost:3000/auth/google/start';
	const request = new Request(url, { method: overrides.method ?? 'GET' });
	return {
		request,
		requestUrl: new URL(url),
		requestId: 'req-1',
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
	it('returns a 303 redirect to /', async () => {
		const context = createContext({
			url: 'http://localhost:3000/auth/sign-out',
			sessionToken: 'mock-token',
		});
		const response = await handleSignOut(context);
		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe('/');
	});

	it('sets an expired session cookie', async () => {
		const context = createContext({
			url: 'http://localhost:3000/auth/sign-out',
			sessionToken: 'mock-token',
		});
		const response = await handleSignOut(context);
		const cookies = response.headers.getSetCookie();
		expect(cookies.some((c: string) => c.includes('Max-Age=0'))).toBe(true);
	});
});
