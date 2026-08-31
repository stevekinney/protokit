import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';
import { runScheduledCleanup } from '@web/lib/scheduled-cleanup';
import { deleteTestAccounts } from '@web/test-support/delete-test-accounts';
import { fetchFromTestServer, startTestServer } from '@web/test-support/start-test-server';
import type { TestServerHandle } from '@web/test-support/start-test-server';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';

const { handleApplicationRequest } = await import('@web/application');

/**
 * OAUTH-003: end-to-end proof, against the real dispatcher, real Postgres,
 * and real Redis rate limiter, that refresh-token rotation and revocation
 * are both client-bound and atomic. Finding S-02: `/oauth/revoke`
 * previously authenticated no client at all, and refresh-token rotation
 * mutated (revoked) the presented token before comparing its owning
 * client, so a party holding another client's refresh token could burn it
 * even though its own request was then rejected.
 *
 * `oauth-routes.test.ts` proves each individual response-shape branch
 * against a mocked database (which cannot evaluate a real `WHERE`
 * predicate, so it cannot prove atomicity or cross-client binding by
 * itself); this file proves the real predicate holds against a real
 * database, the same relationship `oauth-mcp-resource-binding.integration.test.ts`
 * has to its own mocked sibling for `OAUTH-001`.
 *
 * Token pairs are seeded directly into the database rather than obtained
 * through a full authorize -> approve -> code-exchange HTTP round trip --
 * that flow is already proved end to end by
 * `oauth-mcp-resource-binding.integration.test.ts` and
 * `oauth-connector-registration.integration.test.ts`. What this file needs
 * is only "a real, client-bound refresh/access token pair exists", and
 * seeding it directly keeps each test to the one or two HTTP round trips
 * its own assertion actually needs -- material under the concurrency test
 * below, where two requests must land inside the same 5-second test
 * timeout as each other even when the shared local Neon HTTP proxy is
 * under load from the rest of the suite running in parallel.
 */

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

// OPEN-3: this file's tests key rate-limit state (token, revoke) by
// network identity (loopback, in this suite), and that state persists in
// Redis across every other file in the same test run. Flush every
// `rate_limit:*` key before this file's Redis-backed tests run, exactly
// like `oauth-mcp-resource-binding.integration.test.ts` does.
if (redisAvailable) {
	const { resetRateLimitState } = await import('@web/test-support/reset-rate-limit-state');
	await resetRateLimitState();
}

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

let server: TestServerHandle | null = null;

beforeEach(async () => {
	// Round 17: the module-scope reset above clears state left by OTHER
	// files, but this file's own cases share one budget too — every case
	// here makes several `/oauth/token` and `/oauth/revoke` round trips from
	// the same loopback identity. Adding cases eventually spent the real
	// limit part-way through the file, and the tests that happened to run
	// last failed with 429 rather than the status they assert. Resetting per
	// case removes the coupling between cases without touching the limits
	// themselves — raising `RATE_LIMIT_*_MAX` for tests would stop this
	// suite exercising the production limits at all, which is the defect
	// SEC-003's own masking incident already taught this repository once.
	if (redisAvailable) {
		const { resetRateLimitState } = await import('@web/test-support/reset-rate-limit-state');
		await resetRateLimitState();
	}
});

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

const testRunId = randomUUID();
const userId = randomUUID();
const clientAId = `rotation-revocation-test-client-a-${testRunId}`;
const clientASecret = 'test-client-a-secret';
const clientBId = `rotation-revocation-test-client-b-${testRunId}`;
const clientBSecret = 'test-client-b-secret';

beforeAll(async () => {
	// `users` and `oauth_clients` are independent parents here — neither
	// references the other — and every statement is an HTTP round trip through
	// the local Neon proxy. Three sequential trips became one wave; on a
	// continuous-integration runner, which runs this suite several times slower
	// than a developer machine, those trips are what pushed individual tests
	// past bun's 5s budget.
	await Promise.all([
		database.insert(schema.users).values({
			id: userId,
			email: `rotation-revocation-test-${testRunId}@example.com`,
			name: 'Rotation Revocation Test User',
			image: null,
			emailVerified: true,
			role: 'user',
		}),
		...(
			[
				[clientAId, clientASecret],
				[clientBId, clientBSecret],
			] as const
		).map(([clientId, clientSecret]) =>
			database.insert(schema.oauthClients).values({
				clientId,
				clientSecret: hashCredential(clientSecret),
				clientName: `Rotation Revocation Test Client (${clientId})`,
				clientType: 'confidential',
				tokenEndpointAuthMethod: 'client_secret_post',
				redirectUris: ['https://example.com/callback'],
				grantTypes: ['authorization_code', 'refresh_token'],
				responseTypes: ['code'],
			}),
		),
	]);
});

afterAll(async () => {
	// One statement per entity instead of one per table: `DATA-001` cascades
	// every child row from `users` and `oauth_clients`, and each extra statement
	// is an HTTP round trip through the local Neon proxy — enough of them
	// overran the 5s hook budget on a continuous-integration runner. See
	// `test-support/delete-test-accounts.ts`.
	await deleteTestAccounts({ clientIds: [clientAId, clientBId], userIds: [userId] });
});

describeWithRedis('client-bound, atomic refresh rotation and revocation (requires Redis)', () => {
	// Every test in this suite carries an explicit 30s budget rather than bun's
	// generic 5s default. These are end-to-end flows against the real
	// dispatcher, real Postgres through the local Neon proxy, and real Redis;
	// the file averages under two seconds per test here and runs several times
	// slower on a continuous-integration runner, which put every one of them
	// near the default line and failed one of them there.
	//
	// The work was reduced first — the parent inserts above are one wave rather
	// than three sequential round trips, and each seeded token pair is one
	// instead of two. What remains is serial by nature: each step consumes the
	// previous step's output over HTTP. A genuine hang still fails, at 30s.
	// This follows the precedent already set for the other end-to-end suites.
	async function seedTokenPair(
		handle: TestServerHandle,
		clientId: string,
		scope = '',
	): Promise<{ accessToken: string; refreshToken: string; resource: string }> {
		const resource = `http://127.0.0.1:${handle.port}/mcp`;
		const accessToken = randomBytes(48).toString('hex');
		const refreshToken = randomBytes(48).toString('hex');
		const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
		const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

		// Both rows depend only on the client and user seeded in `beforeAll`, not
		// on each other, so they go out together — one round trip instead of two,
		// per seeded pair, and this helper is called repeatedly.
		await Promise.all([
			database.insert(schema.oauthTokens).values({
				accessToken: hashCredential(accessToken),
				clientId,
				userId,
				scope,
				resource,
				expiresAt: oneHourFromNow,
			}),
			database.insert(schema.oauthRefreshTokens).values({
				refreshToken: hashCredential(refreshToken),
				clientId,
				userId,
				scope,
				resource,
				accessTokenHash: hashCredential(accessToken),
				familyId: randomUUID(),
				expiresAt: thirtyDaysFromNow,
			}),
		]);

		return { accessToken, refreshToken, resource };
	}

	async function callMcpToolsList(
		handle: TestServerHandle,
		accessToken: string,
	): Promise<Response> {
		return fetchFromTestServer(handle, '/mcp', {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});
	}

	function refreshRequest(
		handle: TestServerHandle,
		refreshToken: string,
		clientId: string,
		clientSecret: string,
		resource: string,
		scope?: string,
	): Promise<Response> {
		return fetchFromTestServer(handle, '/oauth/token', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
				client_id: clientId,
				client_secret: clientSecret,
				resource,
				...(scope !== undefined ? { scope } : {}),
			}).toString(),
		});
	}

	function revokeRequest(
		handle: TestServerHandle,
		token: string,
		clientId: string,
		clientSecret: string,
	): Promise<Response> {
		return fetchFromTestServer(handle, '/oauth/revoke', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				token,
				client_id: clientId,
				client_secret: clientSecret,
			}).toString(),
		});
	}

	it('a failed client-authentication attempt does not mutate the refresh token', async () => {
		const handle = startServer();
		const { refreshToken, resource } = await seedTokenPair(handle, clientAId);

		const wrongSecretResponse = await refreshRequest(
			handle,
			refreshToken,
			clientAId,
			'wrong-secret',
			resource,
		);
		expect(wrongSecretResponse.status).toBe(401);

		// The refresh token must still be usable: a failed authentication
		// attempt reaches no token row and performs no write.
		const legitimateResponse = await refreshRequest(
			handle,
			refreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(legitimateResponse.status).toBe(200);
	}, 30_000);

	it("one client cannot redeem another client's refresh token, and the victim token survives the attempt", async () => {
		const handle = startServer();
		const { refreshToken, resource } = await seedTokenPair(handle, clientAId);

		// Client B presents client A's real refresh token value, but
		// authenticates as itself.
		const crossClientResponse = await refreshRequest(
			handle,
			refreshToken,
			clientBId,
			clientBSecret,
			resource,
		);
		expect(crossClientResponse.status).toBe(400);
		const crossClientBody = (await crossClientResponse.json()) as { error: string };
		expect(crossClientBody.error).toBe('invalid_grant');

		// Client A's own refresh token must not have been burned by client
		// B's attempt: a legitimate rotation by its real owner still works.
		const legitimateResponse = await refreshRequest(
			handle,
			refreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(legitimateResponse.status).toBe(200);
	}, 30_000);

	it('at most one of two concurrent refresh attempts for the same token succeeds', async () => {
		const handle = startServer();
		const { refreshToken, resource } = await seedTokenPair(handle, clientAId);

		const [first, second] = await Promise.all([
			refreshRequest(handle, refreshToken, clientAId, clientASecret, resource),
			refreshRequest(handle, refreshToken, clientAId, clientASecret, resource),
		]);
		const statuses = [first.status, second.status].sort();
		expect(statuses).toEqual([200, 400]);
	}, 30_000);

	// P1 (review round 6): a stolen refresh token submitted concurrently with
	// its legitimate rotation used to be able to leave the winner's brand-new
	// replacement token alive. The mutex UPDATE that revokes the old token
	// always correctly picks exactly one winner (proved by the test above),
	// but the *loser* -- on discovering the token it presented is already
	// revoked -- calls `revokeOauthRefreshTokenFamily`, whose predicate only
	// revokes family members that are *currently* live. With the old
	// (revoke-then-insert) code, the loser could reach that call before the
	// winner had inserted its replacement, so the replacement -- not
	// existing yet -- survived a revocation meant to kill the whole family.
	// The fix inserts the replacement *before* attempting the mutex, which
	// makes the loser's family revocation always observe the winner's
	// replacement as already live, regardless of interleaving. This test
	// races two real, concurrent HTTP requests presenting the identical
	// refresh token against the real dispatcher and real database -- not a
	// sequential replay, which would never exercise this window.
	it("a concurrent replay of a token mid-rotation does not leave the winner's replacement token alive", async () => {
		const handle = startServer();
		const { refreshToken, resource } = await seedTokenPair(handle, clientAId);

		// Both requests present the *identical* refresh token value
		// concurrently -- the P1 scenario: a stolen refresh token submitted
		// at the same moment as its legitimate rotation. The loser is
		// guaranteed to observe the winner's revoke as already committed by
		// the time its own mutex UPDATE fails to match (that failure is
		// exactly what "already committed" means here), so it is guaranteed
		// to reach `revokeOauthRefreshTokenFamily` -- this part is
		// deterministic, not a matter of luck. What was previously a race
		// is only whether that family revocation also caught the winner's
		// brand-new replacement.
		const [first, second] = await Promise.all([
			refreshRequest(handle, refreshToken, clientAId, clientASecret, resource),
			refreshRequest(handle, refreshToken, clientAId, clientASecret, resource),
		]);
		const statuses = [first.status, second.status].sort();
		expect(statuses).toEqual([200, 400]);
		const winner = first.status === 200 ? first : second;
		const winnerBody = (await winner.json()) as { access_token: string; refresh_token: string };

		// The whole family -- including the replacement this exact race
		// produced -- must be dead: the replacement refresh token can no
		// longer rotate...
		const replacementRotateResponse = await refreshRequest(
			handle,
			winnerBody.refresh_token,
			clientAId,
			clientASecret,
			resource,
		);
		expect(replacementRotateResponse.status).toBe(400);

		// ...and its access token can no longer authenticate at /mcp. Without
		// the insert-before-revoke ordering fix, this token could still be
		// live here even though reuse of the family was detected.
		const mcpResponse = await callMcpToolsList(handle, winnerBody.access_token);
		expect(mcpResponse.status).toBe(401);
	}, 30_000);

	it('reuse of a rotated refresh token revokes its whole token family', async () => {
		const handle = startServer();
		const { refreshToken: originalRefreshToken, resource } = await seedTokenPair(handle, clientAId);

		const rotateResponse = await refreshRequest(
			handle,
			originalRefreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(rotateResponse.status).toBe(200);
		const rotatedBody = (await rotateResponse.json()) as {
			access_token: string;
			refresh_token: string;
		};

		// Replay the now-dead original refresh token.
		const replayResponse = await refreshRequest(
			handle,
			originalRefreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(replayResponse.status).toBe(400);

		// The family -- including the token the replay's own rotation had
		// produced -- must now be dead too: the live descendant refresh
		// token can no longer rotate...
		const descendantRefreshResponse = await refreshRequest(
			handle,
			rotatedBody.refresh_token,
			clientAId,
			clientASecret,
			resource,
		);
		expect(descendantRefreshResponse.status).toBe(400);

		// ...and its access token can no longer authenticate at /mcp.
		const mcpResponse = await callMcpToolsList(handle, rotatedBody.access_token);
		expect(mcpResponse.status).toBe(401);
	}, 30_000);

	// Round 12 review (P2): `handleOauthTokenRefreshGrant`'s old-access-token
	// revoke after a successful rotation is best-effort (logged and
	// swallowed, not thrown -- see the comment above that `try`/`catch` in
	// `oauth-routes.ts`). If that update fails, an ancestor refresh-token
	// row ends up revoked while its paired access token stays live. This
	// seeds exactly that end state directly (rather than trying to force the
	// best-effort update to fail over HTTP) and proves a later replay's
	// family revocation still kills the orphaned ancestor's access token, not
	// only the currently-live descendant's.
	it("replaying an ancestor whose old access-token revoke previously failed still kills that ancestor's orphaned access token", async () => {
		const handle = startServer();
		const resource = `http://127.0.0.1:${handle.port}/mcp`;
		const familyId = randomUUID();
		const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
		const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		const oneSecondAgo = new Date(Date.now() - 1000);

		// The ancestor: its refresh token is already revoked (as a real
		// rotation would leave it), but its access token was never revoked—
		// simulating the best-effort revoke having failed and been swallowed.
		const ancestorAccessToken = randomBytes(48).toString('hex');
		const ancestorRefreshToken = randomBytes(48).toString('hex');

		// The live descendant: what the ancestor rotated into. A real replay
		// of the ancestor must kill this too (already covered by the sibling
		// "reuse... revokes its whole token family" test above), so seeding it
		// here proves this test is exercising family revocation generally, not
		// merely a single-member family.
		const descendantAccessToken = randomBytes(48).toString('hex');
		const descendantRefreshToken = randomBytes(48).toString('hex');

		await Promise.all([
			database.insert(schema.oauthTokens).values({
				accessToken: hashCredential(ancestorAccessToken),
				clientId: clientAId,
				userId,
				scope: '',
				resource,
				expiresAt: oneHourFromNow,
				// Deliberately NOT revoked -- the orphan this test targets.
			}),
			database.insert(schema.oauthRefreshTokens).values({
				refreshToken: hashCredential(ancestorRefreshToken),
				clientId: clientAId,
				userId,
				scope: '',
				resource,
				accessTokenHash: hashCredential(ancestorAccessToken),
				familyId,
				// Replay detection must outlive the ancestor's own expiry while a
				// descendant in the same family can still be used.
				expiresAt: oneSecondAgo,
				revokedAt: new Date(),
			}),
			database.insert(schema.oauthTokens).values({
				accessToken: hashCredential(descendantAccessToken),
				clientId: clientAId,
				userId,
				scope: '',
				resource,
				expiresAt: oneHourFromNow,
			}),
			database.insert(schema.oauthRefreshTokens).values({
				refreshToken: hashCredential(descendantRefreshToken),
				clientId: clientAId,
				userId,
				scope: '',
				resource,
				accessTokenHash: hashCredential(descendantAccessToken),
				familyId,
				expiresAt: thirtyDaysFromNow,
			}),
		]);

		// Confirm the orphan really is live before the replay, so a false
		// pass can't be blamed on the seed itself.
		const preReplayMcpResponse = await callMcpToolsList(handle, ancestorAccessToken);
		expect(preReplayMcpResponse.status).toBe(200);

		// Replay the already-revoked ancestor's refresh token -- the reuse
		// signal that triggers family revocation.
		const replayResponse = await refreshRequest(
			handle,
			ancestorRefreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(replayResponse.status).toBe(400);

		// The orphaned ancestor's access token must now be dead too, not only
		// the live descendant's.
		const ancestorMcpResponse = await callMcpToolsList(handle, ancestorAccessToken);
		expect(ancestorMcpResponse.status).toBe(401);
		const descendantMcpResponse = await callMcpToolsList(handle, descendantAccessToken);
		expect(descendantMcpResponse.status).toBe(401);
	}, 30_000);

	it('rejecting a refresh-time scope escalation does not consume the refresh token, and a corrected retry still succeeds', async () => {
		const handle = startServer();
		const { refreshToken, resource } = await seedTokenPair(handle, clientAId, 'profile:read');

		// Requests a scope this refresh token was never granted. Must be
		// rejected *without* burning the refresh token: the atomic
		// revoke-then-check rotation pattern that closes the S-02 race means
		// a token consumed by the mutating UPDATE stays consumed even if a
		// later check in the same request then fails -- so scope validity
		// must be established before that UPDATE runs, not after.
		const escalationResponse = await refreshRequest(
			handle,
			refreshToken,
			clientAId,
			clientASecret,
			resource,
			'profile:read prompts:read',
		);
		expect(escalationResponse.status).toBe(400);
		const escalationBody = (await escalationResponse.json()) as { error: string };
		expect(escalationBody.error).toBe('invalid_scope');

		// The exact same refresh token must still be live: a corrected retry
		// (omitting the escalated scope) must succeed on the first attempt,
		// not be rejected as a replay of an already-dead token.
		const retryResponse = await refreshRequest(
			handle,
			refreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(retryResponse.status).toBe(200);
	}, 30_000);

	// A review finding on `scheduled-cleanup.ts` (P1): a revoked refresh
	// token used to become eligible for the hourly sweep the instant it
	// rotated, not when it actually expired weeks later. That deletes the
	// exact row `handleOauthTokenRefreshGrant`'s replay-detection lookup
	// depends on -- reads by hash, then checks `revokedAt` -- so a real
	// scheduled sweep running between "attacker steals an old refresh
	// token" and "attacker replays it" would have silently defeated
	// OAUTH-003's rotation-reuse protection. This proves the fix by running
	// the real sweep in between rotation and replay, not merely reading the
	// cleanup predicate.
	it('a scheduled cleanup sweep between rotation and replay does not defeat reuse detection', async () => {
		const handle = startServer();
		const { refreshToken: originalRefreshToken, resource } = await seedTokenPair(handle, clientAId);

		const rotateResponse = await refreshRequest(
			handle,
			originalRefreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(rotateResponse.status).toBe(200);
		const rotatedBody = (await rotateResponse.json()) as {
			access_token: string;
			refresh_token: string;
		};

		// Simulate the in-process hourly sweep firing between the legitimate
		// rotation above and the attacker's replay below. The now-revoked
		// original refresh token has weeks left on its own `expiresAt`
		// (`seedTokenPair` mints it 30 days out), so a real sweep must leave
		// it in place.
		await runScheduledCleanup();

		const stillPresent = await database
			.select({ revokedAt: schema.oauthRefreshTokens.revokedAt })
			.from(schema.oauthRefreshTokens)
			.where(eq(schema.oauthRefreshTokens.refreshToken, hashCredential(originalRefreshToken)))
			.limit(1);
		expect(stillPresent).toHaveLength(1);
		expect(stillPresent[0]?.revokedAt).not.toBeNull();

		// Replay the now-dead original refresh token, after the sweep.
		const replayResponse = await refreshRequest(
			handle,
			originalRefreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(replayResponse.status).toBe(400);

		// Reuse detection must still have fired: the live descendant refresh
		// token can no longer rotate...
		const descendantRefreshResponse = await refreshRequest(
			handle,
			rotatedBody.refresh_token,
			clientAId,
			clientASecret,
			resource,
		);
		expect(descendantRefreshResponse.status).toBe(400);

		// ...and its access token can no longer authenticate at /mcp.
		const mcpResponse = await callMcpToolsList(handle, rotatedBody.access_token);
		expect(mcpResponse.status).toBe(401);
	}, 30_000); // a real global cleanup sweep against the shared test database is slower than the 5s default.

	it("a different client presenting client A's already-rotated-away refresh token cannot revoke client A's live token family", async () => {
		const handle = startServer();
		const { refreshToken: originalRefreshToken, resource } = await seedTokenPair(handle, clientAId);

		// Client A legitimately rotates. The original refresh token is now
		// revoked (rotated-away) and a live descendant exists.
		const rotateResponse = await refreshRequest(
			handle,
			originalRefreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(rotateResponse.status).toBe(200);
		const rotatedBody = (await rotateResponse.json()) as {
			access_token: string;
			refresh_token: string;
		};

		// Client B -- authenticated as itself, and with no relationship to
		// client A's token family -- presents client A's now-dead original
		// refresh token value. It must be rejected, and it must NOT be
		// treated as a replay of client B's own family (there is no such
		// family): client A's live descendant must be unaffected.
		const crossClientReplay = await refreshRequest(
			handle,
			originalRefreshToken,
			clientBId,
			clientBSecret,
			resource,
		);
		expect(crossClientReplay.status).toBe(400);

		// Client A's live access token must still authenticate at /mcp:
		// client B's replay attempt must not have revoked client A's token
		// family. Checked before rotating the descendant refresh token below,
		// since a legitimate rotation would itself revoke this access token
		// as an ordinary side effect and give a false negative.
		const mcpResponse = await callMcpToolsList(handle, rotatedBody.access_token);
		expect(mcpResponse.status).not.toBe(401);

		// ...and the live descendant refresh token must still be able to
		// rotate.
		const descendantRefreshResponse = await refreshRequest(
			handle,
			rotatedBody.refresh_token,
			clientAId,
			clientASecret,
			resource,
		);
		expect(descendantRefreshResponse.status).toBe(200);
	}, 30_000);

	it("one client cannot revoke another client's token, and the victim token survives the attempt", async () => {
		const handle = startServer();
		const { accessToken } = await seedTokenPair(handle, clientAId);

		const crossClientRevoke = await revokeRequest(handle, accessToken, clientBId, clientBSecret);
		// RFC 7009 §2.2: always 200, whether or not the caller actually owned
		// (or could have revoked) the token -- never a signal a caller can
		// use to learn anything about a token it doesn't own.
		expect(crossClientRevoke.status).toBe(200);

		const mcpResponse = await callMcpToolsList(handle, accessToken);
		expect(mcpResponse.status).not.toBe(401);
	}, 30_000);

	it('a client authenticated as its own owner can revoke its own token', async () => {
		const handle = startServer();
		const { accessToken } = await seedTokenPair(handle, clientAId);

		const revokeResponse = await revokeRequest(handle, accessToken, clientAId, clientASecret);
		expect(revokeResponse.status).toBe(200);

		const mcpResponse = await callMcpToolsList(handle, accessToken);
		expect(mcpResponse.status).toBe(401);
	}, 30_000);

	// A2 review finding: revoking a live access token used to only touch the
	// `oauth_tokens` row for that token -- the `oauth_refresh_tokens` row
	// paired with it (via `access_token_hash`) was left completely live. A
	// client could immediately call `/oauth/token` with that still-live
	// refresh token and mint a brand-new access token, undoing the
	// revocation the caller just requested. This proves the fix against the
	// real database: revoking the access token must also kill the refresh
	// token that minted it, so a subsequent refresh attempt is rejected.
	it('revoking a live access token also revokes the refresh token paired with it, so it can no longer mint a replacement (A2)', async () => {
		const handle = startServer();
		const { accessToken, refreshToken, resource } = await seedTokenPair(handle, clientAId);

		const revokeResponse = await revokeRequest(handle, accessToken, clientAId, clientASecret);
		expect(revokeResponse.status).toBe(200);

		const mcpResponse = await callMcpToolsList(handle, accessToken);
		expect(mcpResponse.status).toBe(401);

		const refreshResponse = await refreshRequest(
			handle,
			refreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(refreshResponse.status).toBe(400);
		const refreshBody = await refreshResponse.json();
		expect(refreshBody.error).toBe('invalid_grant');
	}, 30_000);

	// A1 review finding: `token_type_hint` is only an optimization hint per
	// RFC 7009 §2.1 -- the server MUST still search every supported token
	// type when the hinted lookup misses. Proves both mismatched directions
	// against the real database: a refresh token hinted as an access token,
	// and an access token hinted as a refresh token, must both still end up
	// revoked.
	it('revokes a refresh token even when it is mislabeled with token_type_hint=access_token (A1)', async () => {
		const handle = startServer();
		const { refreshToken, accessToken, resource } = await seedTokenPair(handle, clientAId);

		const revokeResponse = await fetchFromTestServer(handle, '/oauth/revoke', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				token: refreshToken,
				token_type_hint: 'access_token',
				client_id: clientAId,
				client_secret: clientASecret,
			}).toString(),
		});
		expect(revokeResponse.status).toBe(200);

		const refreshResponse = await refreshRequest(
			handle,
			refreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(refreshResponse.status).toBe(400);

		// The paired access token issued alongside it must have been revoked
		// too (mirrors the existing, already-correct un-hinted refresh-token
		// revocation behavior).
		const mcpResponse = await callMcpToolsList(handle, accessToken);
		expect(mcpResponse.status).toBe(401);
	}, 30_000);

	it('revokes an access token even when it is mislabeled with token_type_hint=refresh_token (A1)', async () => {
		const handle = startServer();
		const { accessToken } = await seedTokenPair(handle, clientAId);

		const revokeResponse = await fetchFromTestServer(handle, '/oauth/revoke', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				token: accessToken,
				token_type_hint: 'refresh_token',
				client_id: clientAId,
				client_secret: clientASecret,
			}).toString(),
		});
		expect(revokeResponse.status).toBe(200);

		const mcpResponse = await callMcpToolsList(handle, accessToken);
		expect(mcpResponse.status).toBe(401);
	}, 30_000);

	it('revocation with a wrong client secret is rejected and does not revoke the token', async () => {
		const handle = startServer();
		const { accessToken } = await seedTokenPair(handle, clientAId);

		const revokeResponse = await revokeRequest(handle, accessToken, clientAId, 'wrong-secret');
		expect(revokeResponse.status).toBe(401);

		const mcpResponse = await callMcpToolsList(handle, accessToken);
		expect(mcpResponse.status).not.toBe(401);
	}, 30_000);

	/**
	 * A P2 review finding: `handleOauthRevokePostInner`'s refresh-token
	 * predicate excluded an already-revoked row, so revoking an
	 * already-rotated refresh token matched nothing and fell straight
	 * through to the generic RFC 7009 200 -- without ever consulting
	 * `familyId`, leaving the live descendant refresh and access tokens
	 * usable despite the explicit revocation request. This is the same
	 * reuse signal the refresh grant's own replay detection already treats
	 * as family compromise (see "reuse of a rotated refresh token revokes
	 * its whole token family" above); this endpoint must not offer a way
	 * to dodge that defense.
	 */
	it('revoking an already-rotated refresh token revokes its whole token family, and still returns 200', async () => {
		const handle = startServer();
		const { refreshToken: originalRefreshToken, resource } = await seedTokenPair(handle, clientAId);

		const rotateResponse = await refreshRequest(
			handle,
			originalRefreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(rotateResponse.status).toBe(200);
		const rotatedBody = (await rotateResponse.json()) as {
			access_token: string;
			refresh_token: string;
		};
		await database
			.update(schema.oauthRefreshTokens)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(schema.oauthRefreshTokens.refreshToken, hashCredential(originalRefreshToken)));

		// Revoke the now-dead original refresh token instead of replaying it
		// through /oauth/token.
		const revokeResponse = await revokeRequest(
			handle,
			originalRefreshToken,
			clientAId,
			clientASecret,
		);
		// RFC 7009 §2.2: still an unconditional 200 -- reuse detection must
		// not change what this endpoint reveals to the caller.
		expect(revokeResponse.status).toBe(200);

		// The family -- including the live descendant the rotation above
		// produced -- must now be dead: it can no longer rotate...
		const descendantRefreshResponse = await refreshRequest(
			handle,
			rotatedBody.refresh_token,
			clientAId,
			clientASecret,
			resource,
		);
		expect(descendantRefreshResponse.status).toBe(400);

		// ...and its access token can no longer authenticate at /mcp.
		const mcpResponse = await callMcpToolsList(handle, rotatedBody.access_token);
		expect(mcpResponse.status).toBe(401);
	}, 30_000);

	it("a different client revoking client A's already-rotated-away refresh token cannot revoke client A's live token family", async () => {
		const handle = startServer();
		const { refreshToken: originalRefreshToken, resource } = await seedTokenPair(handle, clientAId);

		const rotateResponse = await refreshRequest(
			handle,
			originalRefreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(rotateResponse.status).toBe(200);
		const rotatedBody = (await rotateResponse.json()) as {
			access_token: string;
			refresh_token: string;
		};

		// Client B -- with no relationship to client A's family -- revokes
		// client A's now-dead original refresh token value under its own
		// credentials. Must not be treated as a replay of client B's own
		// (nonexistent) family: client A's live descendant must survive.
		const crossClientRevoke = await revokeRequest(
			handle,
			originalRefreshToken,
			clientBId,
			clientBSecret,
		);
		expect(crossClientRevoke.status).toBe(200);

		const mcpResponse = await callMcpToolsList(handle, rotatedBody.access_token);
		expect(mcpResponse.status).not.toBe(401);

		const descendantRefreshResponse = await refreshRequest(
			handle,
			rotatedBody.refresh_token,
			clientAId,
			clientASecret,
			resource,
		);
		expect(descendantRefreshResponse.status).toBe(200);
	}, 30_000);
});
