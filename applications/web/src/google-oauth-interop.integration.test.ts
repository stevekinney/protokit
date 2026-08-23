import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { fetchFromTestServer, startTestServer } from '@web/test-support/start-test-server';
import type { TestServerHandle } from '@web/test-support/start-test-server';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';

/**
 * FEDAUTH-001 / S-16: end-to-end proof, against the real dispatcher and real
 * Postgres, that the hardened Google sign-in flow is wired together
 * correctly — state, PKCE, nonce, the per-attempt cookie, the single-use
 * claim, and identity-conflict handling all through the real HTTP path.
 *
 * Only the three functions that would otherwise reach Google's live network
 * (token exchange, userinfo, ID token/JWKS validation) are stubbed, using
 * the real module for everything else — `google-authentication.test.ts` and
 * `google-id-token.test.ts` already exhaustively cover the fetch-bounding
 * and signature/claim-validation logic those stubs replace, with injected
 * `fetchImpl` and no live network either.
 */

type StubGoogleIdentity = {
	sub: string;
	email: string;
	name: string;
	picture?: string;
};

const stubbedIdentity: { current: StubGoogleIdentity } = {
	current: { sub: 'interop-sub-default', email: 'default@example.com', name: 'Default' },
};

/**
 * Normally the userinfo-fetched `sub` and the validated ID token's `sub`
 * agree (both keyed off `stubbedIdentity.current`). Setting this lets one
 * test make them disagree, proving `handleGoogleSignInCallback`'s
 * cross-check between the two actually rejects a mismatch rather than
 * trusting the userinfo response alone.
 */
const idTokenSubOverride: { value: string | null } = { value: null };

const actualGoogleAuthentication = await import('@web/lib/google-authentication');
mock.module('@web/lib/google-authentication', () => ({
	...actualGoogleAuthentication,
	exchangeGoogleCodeForTokens: async () => ({
		accessToken: 'stub-access-token',
		idToken: 'stub-id-token',
	}),
	getGoogleUserProfile: async () => ({
		sub: stubbedIdentity.current.sub,
		email: stubbedIdentity.current.email,
		email_verified: true,
		name: stubbedIdentity.current.name,
		picture: stubbedIdentity.current.picture,
	}),
}));
mock.module('@web/lib/google-id-token', () => ({
	validateGoogleIdToken: async () => ({
		sub: idTokenSubOverride.value ?? stubbedIdentity.current.sub,
		email: stubbedIdentity.current.email,
		email_verified: true as const,
		name: stubbedIdentity.current.name,
		picture: stubbedIdentity.current.picture,
	}),
}));

const { handleApplicationRequest } = await import('@web/application');

let redisAvailable: boolean;
try {
	const { isRedisHealthy } = await import('@web/lib/redis-client');
	redisAvailable = await Promise.race([
		isRedisHealthy(),
		new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
	]);
} catch {
	redisAvailable = false;
}
// This file makes nine `/auth/google/start` requests against a
// `RATE_LIMIT_GOOGLE_AUTH_MAX` of 20, so it cannot exhaust the limit on its own
// — but the counter is shared across every file and every prior run, so without
// this reset it inherits a spent budget and fails with a stale 429.
if (redisAvailable) {
	const { resetRateLimitState } = await import('@web/test-support/reset-rate-limit-state');
	await resetRateLimitState();
}

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

let server: TestServerHandle | null = null;

afterEach(() => {
	server?.stop();
	server = null;
});

function startServer(): TestServerHandle {
	server = startTestServer((request, bunServer) =>
		handleApplicationRequest(request, {
			clientAddress: bunServer.requestIP(request)?.address,
		}),
	);
	return server;
}

function parseSetCookiePair(setCookieHeader: string): { name: string; value: string } {
	const pair = setCookieHeader.split(';')[0]!;
	const separatorIndex = pair.indexOf('=');
	return { name: pair.slice(0, separatorIndex), value: pair.slice(separatorIndex + 1) };
}

async function startSignIn(handle: TestServerHandle): Promise<{ cookie: string; state: string }> {
	const response = await fetchFromTestServer(handle, '/auth/google/start', {
		redirect: 'manual',
	});
	expect(response.status).toBe(302);
	const location = new URL(response.headers.get('Location')!);
	const state = location.searchParams.get('state')!;
	const { name, value } = parseSetCookiePair(response.headers.getSetCookie()[0]!);
	return { cookie: `${name}=${value}`, state };
}

const testRunId = randomUUID();
const createdUserEmails: string[] = [];

afterAll(async () => {
	for (const email of createdUserEmails) {
		const [user] = await database
			.select({ id: schema.users.id })
			.from(schema.users)
			.where(eq(schema.users.email, email))
			.limit(1);
		if (user) {
			await database.delete(schema.userSessions).where(eq(schema.userSessions.userId, user.id));
			await database
				.delete(schema.userGoogleAccounts)
				.where(eq(schema.userGoogleAccounts.userId, user.id));
			await database.delete(schema.users).where(eq(schema.users.id, user.id));
		}
	}
});

describeWithRedis('Google sign-in interop (requires Redis)', () => {
	it('GET /auth/google/start requests PKCE S256 and a nonce, and sets a per-attempt cookie', async () => {
		const handle = startServer();
		const response = await fetchFromTestServer(handle, `/auth/google/start`, {
			redirect: 'manual',
		});
		expect(response.status).toBe(302);

		const location = new URL(response.headers.get('Location')!);
		expect(location.hostname).toBe('accounts.google.com');
		expect(location.searchParams.get('code_challenge_method')).toBe('S256');
		expect(location.searchParams.get('code_challenge')).not.toBeNull();
		expect(location.searchParams.get('nonce')).not.toBeNull();
		expect(location.searchParams.get('state')).not.toBeNull();

		const setCookie = response.headers.getSetCookie()[0]!;
		expect(setCookie).toContain('google_oauth_state_');
		expect(setCookie).toContain('HttpOnly');
	});

	it('completes a full sign-in round trip and clears the state cookie on success', async () => {
		const handle = startServer();
		const email = `fedauth-interop-${testRunId}-a@example.com`;
		createdUserEmails.push(email);
		stubbedIdentity.current = { sub: `interop-sub-${testRunId}-a`, email, name: 'Interop A' };

		const { cookie, state } = await startSignIn(handle);
		const response = await fetchFromTestServer(
			handle,
			`/auth/google/callback?code=stub-code&state=${state}`,
			{ headers: { cookie }, redirect: 'manual' },
		);

		expect(response.status).toBe(302);
		const setCookies = response.headers.getSetCookie();
		expect(setCookies.some((c) => c.includes('Max-Age=0'))).toBe(true);
		expect(setCookies.some((c) => !c.includes('Max-Age=0'))).toBe(true);

		const [user] = await database
			.select({ email: schema.users.email })
			.from(schema.users)
			.where(eq(schema.users.email, email))
			.limit(1);
		expect(user?.email).toBe(email);
	});

	it('rejects a missing code and still clears the state cookie', async () => {
		const handle = startServer();
		const { cookie, state } = await startSignIn(handle);
		const response = await fetchFromTestServer(handle, `/auth/google/callback?state=${state}`, {
			headers: { cookie },
		});
		expect(response.status).toBe(400);
		expect(response.headers.getSetCookie().some((c) => c.includes('Max-Age=0'))).toBe(true);
	});

	it('rejects when the userinfo response and the validated ID token identify different subjects', async () => {
		const handle = startServer();
		const email = `fedauth-interop-${testRunId}-mismatch@example.com`;
		stubbedIdentity.current = {
			sub: `interop-sub-${testRunId}-mismatch-userinfo`,
			email,
			name: 'Mismatch',
		};
		idTokenSubOverride.value = `interop-sub-${testRunId}-mismatch-idtoken`;

		const { cookie, state } = await startSignIn(handle);
		const response = await fetchFromTestServer(
			handle,
			`/auth/google/callback?code=stub-code&state=${state}`,
			{ headers: { cookie }, redirect: 'manual' },
		);
		idTokenSubOverride.value = null;

		expect(response.status).toBe(500);
		const [user] = await database
			.select({ id: schema.users.id })
			.from(schema.users)
			.where(eq(schema.users.email, email))
			.limit(1);
		expect(user).toBeUndefined();
	});

	it('rejects a tampered state cookie', async () => {
		const handle = startServer();
		const { state } = await startSignIn(handle);
		const response = await fetchFromTestServer(
			handle,
			`/auth/google/callback?code=stub-code&state=${state}`,
			{ headers: { cookie: `google_oauth_state_${state.slice(0, 16)}=tampered` } },
		);
		expect(response.status).toBe(400);
	});

	it('rejects replaying the same successful callback a second time', async () => {
		const handle = startServer();
		const email = `fedauth-interop-${testRunId}-b@example.com`;
		createdUserEmails.push(email);
		stubbedIdentity.current = { sub: `interop-sub-${testRunId}-b`, email, name: 'Interop B' };

		const { cookie, state } = await startSignIn(handle);
		const callbackPath = `/auth/google/callback?code=stub-code&state=${state}`;

		const first = await fetchFromTestServer(handle, callbackPath, {
			headers: { cookie },
			redirect: 'manual',
		});
		expect(first.status).toBe(302);

		const second = await fetchFromTestServer(handle, callbackPath, {
			headers: { cookie },
			redirect: 'manual',
		});
		expect(second.status).toBe(400);
	});

	it('rejects a second Google identity claiming an email already tied to another account', async () => {
		const handle = startServer();
		const email = `fedauth-interop-${testRunId}-conflict@example.com`;
		createdUserEmails.push(email);

		stubbedIdentity.current = {
			sub: `interop-sub-${testRunId}-conflict-1`,
			email,
			name: 'Conflict One',
		};
		const firstAttempt = await startSignIn(handle);
		const firstResponse = await fetchFromTestServer(
			handle,
			`/auth/google/callback?code=stub-code&state=${firstAttempt.state}`,
			{ headers: { cookie: firstAttempt.cookie }, redirect: 'manual' },
		);
		expect(firstResponse.status).toBe(302);

		stubbedIdentity.current = {
			sub: `interop-sub-${testRunId}-conflict-2`,
			email,
			name: 'Conflict Two',
		};
		const secondAttempt = await startSignIn(handle);
		const secondResponse = await fetchFromTestServer(
			handle,
			`/auth/google/callback?code=stub-code&state=${secondAttempt.state}`,
			{ headers: { cookie: secondAttempt.cookie }, redirect: 'manual' },
		);
		expect(secondResponse.status).toBe(409);

		const accounts = await database
			.select({ googleSubject: schema.userGoogleAccounts.googleSubject })
			.from(schema.userGoogleAccounts)
			.innerJoin(schema.users, eq(schema.users.id, schema.userGoogleAccounts.userId))
			.where(eq(schema.users.email, email));
		expect(accounts.length).toBe(1);
		expect(accounts[0]?.googleSubject).toBe(`interop-sub-${testRunId}-conflict-1`);
	});

	it('normalizes email case before making a uniqueness decision', async () => {
		const handle = startServer();
		const lowercaseEmail = `fedauth-interop-${testRunId}-case@example.com`;
		createdUserEmails.push(lowercaseEmail);
		const uppercaseVariant = lowercaseEmail.toUpperCase();

		stubbedIdentity.current = {
			sub: `interop-sub-${testRunId}-case-1`,
			email: uppercaseVariant,
			name: 'Case One',
		};
		const firstAttempt = await startSignIn(handle);
		const firstResponse = await fetchFromTestServer(
			handle,
			`/auth/google/callback?code=stub-code&state=${firstAttempt.state}`,
			{ headers: { cookie: firstAttempt.cookie }, redirect: 'manual' },
		);
		expect(firstResponse.status).toBe(302);

		const [user] = await database
			.select({ email: schema.users.email })
			.from(schema.users)
			.where(eq(schema.users.email, lowercaseEmail))
			.limit(1);
		expect(user?.email).toBe(lowercaseEmail);
	});
});
