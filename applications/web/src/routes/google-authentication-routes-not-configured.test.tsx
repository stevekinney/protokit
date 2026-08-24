import { describe, expect, it, mock } from 'bun:test';

// Covers `googleAuthNotConfiguredResponse` (returned by both
// `handleGoogleSignInStart` and `handleGoogleSignInCallback` when
// `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are unset), which
// `google-authentication-routes.test.tsx`'s env mock never exercises since
// it always sets both. Lives in its own file (this project runs
// `bun test --isolate`) so its differing `@web/env` mock cannot leak into
// the sibling test files.

mock.module('@web/env', () => ({
	environment: {
		GOOGLE_CLIENT_ID: undefined,
		GOOGLE_CLIENT_SECRET: undefined,
		SESSION_SIGNING_SECRET: 'a-very-secret-key-that-is-at-least-32-chars-long',
		SESSION_COOKIE_NAME: 'test_session',
		SESSION_TIME_TO_LIVE_SECONDS: 3600,
		NODE_ENV: 'test',
		BASE_URL: undefined,
	},
}));

mock.module('@web/lib/google-authentication', () => ({
	createGoogleSignInRedirectResponse: () => {
		throw new Error('should not be reached when Google auth is not configured');
	},
	exchangeGoogleCodeForTokens: async () => {
		throw new Error('should not be reached when Google auth is not configured');
	},
	getGoogleUserProfile: async () => {
		throw new Error('should not be reached when Google auth is not configured');
	},
	resolveGoogleOauthCallbackCookieName: () => null,
	validateGoogleCallbackState: async () => ({ valid: false, error: 'unused' }),
	clearGoogleStateCookie: (_request: Request, cookieName: string) => `${cookieName}=; Max-Age=0`,
}));

mock.module('@web/lib/google-id-token', () => ({
	validateGoogleIdToken: async () => {
		throw new Error('should not be reached when Google auth is not configured');
	},
}));

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
	recordFailedAuthentication: async () => {},
}));

mock.module('@web/lib/session-authentication', () => ({
	createSession: async () => {
		throw new Error('should not be reached when Google auth is not configured');
	},
	revokeSession: async () => {},
	createExpiredSessionCookie: () => 'test_session=; Max-Age=0',
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
		}),
		insert: () => ({
			values: () =>
				Object.assign(Promise.resolve(undefined), {
					onConflictDoNothing: () => ({ returning: async () => [] }),
				}),
		}),
		update: () => ({ set: () => ({ where: async () => {} }) }),
		delete: () => ({ where: async () => {} }),
	},
	schema: {
		users: { id: 'id', email: 'email' },
		userGoogleAccounts: { googleSubject: 'googleSubject', userId: 'userId' },
	},
}));

mock.module('drizzle-orm', () => ({
	eq: (column: unknown, value: unknown) => ({ column, value }),
}));

const { handleGoogleSignInStart, handleGoogleSignInCallback } =
	await import('@web/routes/google-authentication-routes');
import type { RequestContext } from '@web/lib/request-context';

function createContext(url: string): RequestContext {
	const request = new Request(url);
	return {
		request,
		requestUrl: new URL(url),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: null,
		sessionToken: null,
	};
}

describe('handleGoogleSignInStart (Google sign-in not configured)', () => {
	it('returns 503 with a static error page instead of starting the OAuth flow', async () => {
		const response = await handleGoogleSignInStart(
			createContext('http://localhost:3000/auth/google/start'),
		);
		expect(response.status).toBe(503);
		const body = await response.text();
		expect(body).toContain('Google sign-in is not configured');
		expect(body).toContain('Google Sign-In Not Configured');
	});
});

describe('handleGoogleSignInCallback (Google sign-in not configured)', () => {
	it('returns 503 with a static error page instead of processing the callback', async () => {
		const response = await handleGoogleSignInCallback(
			createContext('http://localhost:3000/auth/google/callback?code=test-code&state=valid-state'),
		);
		expect(response.status).toBe(503);
		const body = await response.text();
		expect(body).toContain('Google sign-in is not configured');
	});
});
