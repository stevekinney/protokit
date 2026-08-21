import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';

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
 * `oauth-routes.test.tsx` proves each individual response-shape branch
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
	const { getRedisClient } = await import('@web/lib/redis-client');
	const redisClient = await getRedisClient();
	const staleRateLimitKeys = await redisClient.keys('rate_limit:*');
	if (staleRateLimitKeys.length > 0) {
		await redisClient.del(staleRateLimitKeys);
	}
}

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

let server: Bun.Server | null = null;

afterEach(() => {
	server?.stop(true);
	server = null;
});

function startServer(): number {
	server = Bun.serve({
		port: 0,
		fetch(request, bunServer) {
			return handleApplicationRequest(request, {
				clientAddress: bunServer.requestIP(request)?.address,
			});
		},
	});
	return server.port;
}

const testRunId = randomUUID();
const userId = randomUUID();
const clientAId = `rotation-revocation-test-client-a-${testRunId}`;
const clientASecret = 'test-client-a-secret';
const clientBId = `rotation-revocation-test-client-b-${testRunId}`;
const clientBSecret = 'test-client-b-secret';

beforeAll(async () => {
	await database.insert(schema.users).values({
		id: userId,
		email: `rotation-revocation-test-${testRunId}@example.com`,
		name: 'Rotation Revocation Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
	for (const [clientId, clientSecret] of [
		[clientAId, clientASecret],
		[clientBId, clientBSecret],
	] as const) {
		await database.insert(schema.oauthClients).values({
			clientId,
			clientSecret: hashCredential(clientSecret),
			clientName: `Rotation Revocation Test Client (${clientId})`,
			clientType: 'confidential',
			tokenEndpointAuthMethod: 'client_secret_post',
			redirectUris: ['https://example.com/callback'],
			grantTypes: ['authorization_code', 'refresh_token'],
			responseTypes: ['code'],
		});
	}
});

afterAll(async () => {
	for (const clientId of [clientAId, clientBId]) {
		await database.delete(schema.oauthTokens).where(eq(schema.oauthTokens.clientId, clientId));
		await database
			.delete(schema.oauthRefreshTokens)
			.where(eq(schema.oauthRefreshTokens.clientId, clientId));
		await database.delete(schema.oauthClients).where(eq(schema.oauthClients.clientId, clientId));
	}
	await database.delete(schema.users).where(eq(schema.users.id, userId));
});

describeWithRedis('client-bound, atomic refresh rotation and revocation (requires Redis)', () => {
	async function seedTokenPair(
		port: number,
		clientId: string,
	): Promise<{ accessToken: string; refreshToken: string; resource: string }> {
		const resource = `http://127.0.0.1:${port}/mcp`;
		const accessToken = randomBytes(48).toString('hex');
		const refreshToken = randomBytes(48).toString('hex');
		const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
		const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

		await database.insert(schema.oauthTokens).values({
			accessToken: hashCredential(accessToken),
			clientId,
			userId,
			scope: '',
			resource,
			expiresAt: oneHourFromNow,
		});
		await database.insert(schema.oauthRefreshTokens).values({
			refreshToken: hashCredential(refreshToken),
			clientId,
			userId,
			scope: '',
			resource,
			accessTokenHash: hashCredential(accessToken),
			familyId: randomUUID(),
			expiresAt: thirtyDaysFromNow,
		});

		return { accessToken, refreshToken, resource };
	}

	async function callMcpToolsList(port: number, accessToken: string): Promise<Response> {
		return fetch(`http://127.0.0.1:${port}/mcp`, {
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
		port: number,
		refreshToken: string,
		clientId: string,
		clientSecret: string,
		resource: string,
	): Promise<Response> {
		return fetch(`http://127.0.0.1:${port}/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
				client_id: clientId,
				client_secret: clientSecret,
				resource,
			}).toString(),
		});
	}

	function revokeRequest(
		port: number,
		token: string,
		clientId: string,
		clientSecret: string,
	): Promise<Response> {
		return fetch(`http://127.0.0.1:${port}/oauth/revoke`, {
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
		const port = startServer();
		const { refreshToken, resource } = await seedTokenPair(port, clientAId);

		const wrongSecretResponse = await refreshRequest(
			port,
			refreshToken,
			clientAId,
			'wrong-secret',
			resource,
		);
		expect(wrongSecretResponse.status).toBe(401);

		// The refresh token must still be usable: a failed authentication
		// attempt reaches no token row and performs no write.
		const legitimateResponse = await refreshRequest(
			port,
			refreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(legitimateResponse.status).toBe(200);
	});

	it("one client cannot redeem another client's refresh token, and the victim token survives the attempt", async () => {
		const port = startServer();
		const { refreshToken, resource } = await seedTokenPair(port, clientAId);

		// Client B presents client A's real refresh token value, but
		// authenticates as itself.
		const crossClientResponse = await refreshRequest(
			port,
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
			port,
			refreshToken,
			clientAId,
			clientASecret,
			resource,
		);
		expect(legitimateResponse.status).toBe(200);
	});

	it('at most one of two concurrent refresh attempts for the same token succeeds', async () => {
		const port = startServer();
		const { refreshToken, resource } = await seedTokenPair(port, clientAId);

		const [first, second] = await Promise.all([
			refreshRequest(port, refreshToken, clientAId, clientASecret, resource),
			refreshRequest(port, refreshToken, clientAId, clientASecret, resource),
		]);
		const statuses = [first.status, second.status].sort();
		expect(statuses).toEqual([200, 400]);
	});

	it('reuse of a rotated refresh token revokes its whole token family', async () => {
		const port = startServer();
		const { refreshToken: originalRefreshToken, resource } = await seedTokenPair(port, clientAId);

		const rotateResponse = await refreshRequest(
			port,
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
			port,
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
			port,
			rotatedBody.refresh_token,
			clientAId,
			clientASecret,
			resource,
		);
		expect(descendantRefreshResponse.status).toBe(400);

		// ...and its access token can no longer authenticate at /mcp.
		const mcpResponse = await callMcpToolsList(port, rotatedBody.access_token);
		expect(mcpResponse.status).toBe(401);
	});

	it("one client cannot revoke another client's token, and the victim token survives the attempt", async () => {
		const port = startServer();
		const { accessToken } = await seedTokenPair(port, clientAId);

		const crossClientRevoke = await revokeRequest(port, accessToken, clientBId, clientBSecret);
		// RFC 7009 §2.2: always 200, whether or not the caller actually owned
		// (or could have revoked) the token -- never a signal a caller can
		// use to learn anything about a token it doesn't own.
		expect(crossClientRevoke.status).toBe(200);

		const mcpResponse = await callMcpToolsList(port, accessToken);
		expect(mcpResponse.status).not.toBe(401);
	});

	it('a client authenticated as its own owner can revoke its own token', async () => {
		const port = startServer();
		const { accessToken } = await seedTokenPair(port, clientAId);

		const revokeResponse = await revokeRequest(port, accessToken, clientAId, clientASecret);
		expect(revokeResponse.status).toBe(200);

		const mcpResponse = await callMcpToolsList(port, accessToken);
		expect(mcpResponse.status).toBe(401);
	});

	it('revocation with a wrong client secret is rejected and does not revoke the token', async () => {
		const port = startServer();
		const { accessToken } = await seedTokenPair(port, clientAId);

		const revokeResponse = await revokeRequest(port, accessToken, clientAId, 'wrong-secret');
		expect(revokeResponse.status).toBe(401);

		const mcpResponse = await callMcpToolsList(port, accessToken);
		expect(mcpResponse.status).not.toBe(401);
	});
});
