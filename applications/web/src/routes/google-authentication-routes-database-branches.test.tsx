import { beforeEach, describe, expect, it, mock } from 'bun:test';

// This file targets the `upsertGoogleUser`/`findUserIdByGoogleSubject`
// branches inside `handleGoogleSignInCallback` that
// `google-authentication-routes.test.tsx`'s always-`[]`/always-succeed
// `@template/database` mock cannot reach: an already-linked Google account
// signing in again, an email already claimed by a different account, and
// the unique-constraint-violation race-condition handling (including its
// 5-attempt retry loop). It needs a stateful database mock, so it lives in
// its own file (this project runs `bun test --isolate`, so each test file
// gets its own module registry and this mock cannot leak into the sibling
// file's tests).

const schema = {
	users: { id: 'users.id', email: 'users.email' },
	userGoogleAccounts: {
		googleSubject: 'userGoogleAccounts.googleSubject',
		userId: 'userGoogleAccounts.userId',
	},
};

type UniqueConstraintError = Error & { code: string };

function uniqueConstraintError(): UniqueConstraintError {
	const error = new Error(
		'duplicate key value violates unique constraint',
	) as UniqueConstraintError;
	error.code = '23505';
	return error;
}

// Configurable per-test database behavior. Reset in `beforeEach`.
let googleAccountSelectResults: { userId: string }[][] = [];
let userSelectResults: { id: string }[][] = [];
let insertUsersReturning: { id: string }[] | null = null;
let updateUsersError: Error | null = null;
let insertGoogleAccountError: Error | null = null;
let deleteUsersError: Error | null = null;
let deletedUserIds: string[] = [];

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
	createSession: async () => ({
		cookieHeaderValue: 'test_session=token; HttpOnly',
		sessionToken: 'mock-session-token',
	}),
	revokeSession: async () => {},
	createExpiredSessionCookie: () => 'test_session=; Max-Age=0',
}));

mock.module('drizzle-orm', () => ({
	eq: (column: unknown, value: unknown) => ({ column, value }),
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: (table: unknown) => ({
				where: () => ({
					limit: async () => {
						if (table === schema.userGoogleAccounts) {
							return googleAccountSelectResults.shift() ?? [];
						}
						if (table === schema.users) {
							return userSelectResults.shift() ?? [];
						}
						return [];
					},
				}),
			}),
		}),
		insert: (table: unknown) => ({
			values: (row: { id?: string }) => {
				if (table === schema.users) {
					return Object.assign(Promise.resolve(undefined), {
						onConflictDoNothing: () => ({
							returning: async () => insertUsersReturning ?? [{ id: row.id! }],
						}),
					});
				}
				if (table === schema.userGoogleAccounts) {
					if (insertGoogleAccountError) {
						return Promise.reject(insertGoogleAccountError);
					}
					return Promise.resolve(undefined);
				}
				return Promise.resolve(undefined);
			},
		}),
		update: (table: unknown) => ({
			set: () => ({
				where: async () => {
					if (updateUsersError && table === schema.users) {
						throw updateUsersError;
					}
				},
			}),
		}),
		delete: (table: unknown) => ({
			where: async (condition: { value?: string }) => {
				if (table === schema.users) {
					if (deleteUsersError) {
						throw deleteUsersError;
					}
					deletedUserIds.push(String(condition?.value));
				}
			},
		}),
	},
	schema,
}));

const { handleGoogleSignInCallback } = await import('@web/routes/google-authentication-routes');
import type { RequestContext } from '@web/lib/request-context';

function createCallbackContext(): RequestContext {
	const url = 'http://localhost:3000/auth/google/callback?code=test-code&state=valid-state';
	return {
		request: new Request(url),
		requestUrl: new URL(url),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: null,
		sessionToken: null,
	};
}

beforeEach(() => {
	googleAccountSelectResults = [];
	userSelectResults = [];
	insertUsersReturning = null;
	updateUsersError = null;
	insertGoogleAccountError = null;
	deleteUsersError = null;
	deletedUserIds = [];
});

describe('handleGoogleSignInCallback: existing Google account (upsertGoogleUser update path)', () => {
	it('signs in and redirects when the Google account is already linked', async () => {
		googleAccountSelectResults = [[{ userId: 'existing-user-id' }]];
		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(302);
		const cookies = response.headers.getSetCookie();
		expect(cookies.some((cookie) => cookie.startsWith('test_session='))).toBe(true);
	});

	it('returns 409 when updating the linked user hits a unique constraint violation', async () => {
		googleAccountSelectResults = [[{ userId: 'existing-user-id' }]];
		updateUsersError = uniqueConstraintError();
		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(409);
		const body = await response.text();
		expect(body).toContain('already associated with another account');
	});

	it('returns 500 when updating the linked user fails for an unrelated reason', async () => {
		googleAccountSelectResults = [[{ userId: 'existing-user-id' }]];
		updateUsersError = new Error('connection reset');
		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(500);
		const body = await response.text();
		expect(body).toContain('Google sign-in failed');
	});
});

describe('handleGoogleSignInCallback: email already claimed by a different account', () => {
	it('returns 409 when no Google account is linked but the email belongs to another user', async () => {
		googleAccountSelectResults = [[]];
		userSelectResults = [[{ id: 'someone-elses-user-id' }]];
		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(409);
		const body = await response.text();
		expect(body).toContain('already associated with another account');
	});
});

describe('handleGoogleSignInCallback: first-time insert loses the users.email race', () => {
	it('reconciles onto the winning account once findUserIdByGoogleSubject resolves it', async () => {
		googleAccountSelectResults = [
			[], // upsertGoogleUser's own existingGoogleAccount lookup: none yet
			[{ userId: 'race-winner-user-id' }], // findUserIdByGoogleSubject's retry, attempt 1
		];
		userSelectResults = [[]]; // existingUser lookup: no unrelated conflicting account
		insertUsersReturning = []; // onConflictDoNothing swallowed the insert

		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(302);
		const cookies = response.headers.getSetCookie();
		expect(cookies.some((cookie) => cookie.startsWith('test_session='))).toBe(true);
	});

	it('returns 409 when the retry loop never finds the winning account', async () => {
		googleAccountSelectResults = [
			[], // existingGoogleAccount lookup
			[],
			[],
			[],
			[],
			[], // 5 findUserIdByGoogleSubject retries, all empty
		];
		userSelectResults = [[]];
		insertUsersReturning = [];

		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(409);
		const body = await response.text();
		expect(body).toContain('already associated with another account');
	}, 10_000);
});

describe('handleGoogleSignInCallback: first-time insert loses the userGoogleAccounts.googleSubject race', () => {
	it('reconciles onto the winner, cleans up the orphaned user row, and signs in', async () => {
		googleAccountSelectResults = [
			[], // existingGoogleAccount lookup
			[{ userId: 'race-winner-user-id' }], // findUserIdByGoogleSubject inside the catch block
		];
		userSelectResults = [[]];
		insertUsersReturning = [{ id: 'brand-new-user-id' }];
		insertGoogleAccountError = uniqueConstraintError();

		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(302);
		// `userId` is generated locally with `randomUUID()`, not taken from the
		// mocked `.returning()` row, so assert the cleanup delete fired rather
		// than pinning an exact id.
		expect(deletedUserIds.length).toBe(1);
	});

	it('returns 409 and cleans up when no winner can be found for the race', async () => {
		googleAccountSelectResults = [
			[], // existingGoogleAccount lookup
			[], // findUserIdByGoogleSubject inside the catch block finds nothing
		];
		userSelectResults = [[]];
		insertUsersReturning = [{ id: 'brand-new-user-id' }];
		insertGoogleAccountError = uniqueConstraintError();

		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(409);
		expect(deletedUserIds.length).toBe(1);
	});

	it('returns 500 and cleans up when the second insert fails for an unrelated reason', async () => {
		googleAccountSelectResults = [[]];
		userSelectResults = [[]];
		insertUsersReturning = [{ id: 'brand-new-user-id' }];
		insertGoogleAccountError = new Error('connection reset');

		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(500);
		expect(deletedUserIds.length).toBe(1);
	});

	it('still reconciles onto the winner when the orphaned-row cleanup delete itself throws', async () => {
		// The cleanup delete's own failure is only ever logged (never
		// rethrown) so it can't shadow the real outcome of the race — the
		// request still reconciles onto whichever concurrent request won.
		googleAccountSelectResults = [
			[], // existingGoogleAccount lookup
			[{ userId: 'race-winner-user-id' }], // findUserIdByGoogleSubject inside the catch block
		];
		userSelectResults = [[]];
		insertUsersReturning = [{ id: 'brand-new-user-id' }];
		insertGoogleAccountError = uniqueConstraintError();
		deleteUsersError = new Error('delete failed');

		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(302);
		expect(deletedUserIds.length).toBe(0);
	});

	it('still returns 500 for the original error when the orphaned-row cleanup delete itself throws', async () => {
		googleAccountSelectResults = [[]];
		userSelectResults = [[]];
		insertUsersReturning = [{ id: 'brand-new-user-id' }];
		insertGoogleAccountError = new Error('connection reset');
		deleteUsersError = new Error('delete failed');

		const response = await handleGoogleSignInCallback(createCallbackContext());
		expect(response.status).toBe(500);
		expect(deletedUserIds.length).toBe(0);
	});
});
