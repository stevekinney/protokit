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
 * FEDAUTH-001 / S-16: "concurrent login attempts share one cookie name" was
 * the named defect — every tab shared `google_oauth_state`, so a second tab
 * silently clobbered the first's cookie. These tests prove concurrent
 * sign-in attempts (real HTTP, real Redis-backed single-use claim, real
 * Postgres) survive independently: distinct cookies, distinct single-use
 * claims, and — when two requests race the very same callback — exactly one
 * winner rather than two sessions or a crash.
 *
 * Only the network-touching functions are stubbed (same rationale as
 * `google-oauth-interop.integration.test.ts`); every stub reads a
 * module-level "current identity" set immediately before the matching
 * `startSignIn`/callback round trip, so sequential-but-independent flows
 * for two different tabs resolve to two different identities without
 * needing a live network.
 */

type StubGoogleIdentity = { sub: string; email: string; name: string };

const currentIdentity: { value: StubGoogleIdentity } = {
	value: { sub: 'concurrency-sub-default', email: 'default@example.com', name: 'Default' },
};

const actualGoogleAuthentication = await import('@web/lib/google-authentication');
mock.module('@web/lib/google-authentication', () => ({
	...actualGoogleAuthentication,
	exchangeGoogleCodeForTokens: async () => ({
		accessToken: 'stub-access-token',
		idToken: 'stub-id-token',
	}),
	getGoogleUserProfile: async () => ({
		sub: currentIdentity.value.sub,
		email: currentIdentity.value.email,
		email_verified: true,
		name: currentIdentity.value.name,
	}),
}));
mock.module('@web/lib/google-id-token', () => ({
	validateGoogleIdToken: async () => ({
		sub: currentIdentity.value.sub,
		email: currentIdentity.value.email,
		email_verified: true as const,
		name: currentIdentity.value.name,
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

describeWithRedis('Google sign-in concurrency (requires Redis)', () => {
	it('two concurrent tabs starting sign-in receive distinct, independent state cookies', async () => {
		const handle = startServer();
		const [first, second] = await Promise.all([
			fetchFromTestServer(handle, '/auth/google/start', { redirect: 'manual' }),
			fetchFromTestServer(handle, '/auth/google/start', { redirect: 'manual' }),
		]);

		const firstState = new URL(first.headers.get('Location')!).searchParams.get('state')!;
		const secondState = new URL(second.headers.get('Location')!).searchParams.get('state')!;
		expect(firstState).not.toBe(secondState);

		const firstCookie = parseSetCookiePair(first.headers.getSetCookie()[0]!).name;
		const secondCookie = parseSetCookiePair(second.headers.getSetCookie()[0]!).name;
		expect(firstCookie).not.toBe(secondCookie);
	});

	it('two tabs started concurrently each complete their own sign-in with the cookie that tab actually holds', async () => {
		const handle = startServer();
		const emailA = `fedauth-concurrency-${testRunId}-a@example.com`;
		const emailB = `fedauth-concurrency-${testRunId}-b@example.com`;
		createdUserEmails.push(emailA, emailB);

		// Both tabs are opened before either completes, proving the second
		// `start` cannot have clobbered the first tab's still-pending cookie.
		const [tabA, tabB] = await Promise.all([startSignIn(handle), startSignIn(handle)]);
		expect(tabA.state).not.toBe(tabB.state);

		currentIdentity.value = {
			sub: `concurrency-sub-${testRunId}-a`,
			email: emailA,
			name: 'Concurrency A',
		};
		const responseA = await fetchFromTestServer(
			handle,
			`/auth/google/callback?code=stub-code&state=${tabA.state}`,
			{ headers: { cookie: tabA.cookie }, redirect: 'manual' },
		);
		expect(responseA.status).toBe(302);

		currentIdentity.value = {
			sub: `concurrency-sub-${testRunId}-b`,
			email: emailB,
			name: 'Concurrency B',
		};
		const responseB = await fetchFromTestServer(
			handle,
			`/auth/google/callback?code=stub-code&state=${tabB.state}`,
			{ headers: { cookie: tabB.cookie }, redirect: 'manual' },
		);
		expect(responseB.status).toBe(302);

		const usersA = await database
			.select({ email: schema.users.email })
			.from(schema.users)
			.where(eq(schema.users.email, emailA));
		expect(usersA.length).toBe(1);
		const usersB = await database
			.select({ email: schema.users.email })
			.from(schema.users)
			.where(eq(schema.users.email, emailB));
		expect(usersB.length).toBe(1);
	});

	it('racing the same callback twice at once produces exactly one success', async () => {
		const handle = startServer();
		const email = `fedauth-concurrency-${testRunId}-race@example.com`;
		createdUserEmails.push(email);
		currentIdentity.value = {
			sub: `concurrency-sub-${testRunId}-race`,
			email,
			name: 'Race',
		};

		const attempt = await startSignIn(handle);
		const callbackPath = `/auth/google/callback?code=stub-code&state=${attempt.state}`;
		const [first, second] = await Promise.all([
			fetchFromTestServer(handle, callbackPath, {
				headers: { cookie: attempt.cookie },
				redirect: 'manual',
			}),
			fetchFromTestServer(handle, callbackPath, {
				headers: { cookie: attempt.cookie },
				redirect: 'manual',
			}),
		]);

		const statuses = [first.status, second.status].sort();
		expect(statuses).toEqual([302, 400]);
	});
});
