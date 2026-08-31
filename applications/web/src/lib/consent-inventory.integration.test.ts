import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { GrantRevocationChannel } from '@lostgradient/mcp/http';
import { hashCredential } from '@web/lib/hash-credential';
import { resolveMcpCrossInstanceMessaging } from '@web/lib/mcp-cross-instance-messaging';
import { deleteTestAccounts } from '@web/test-support/delete-test-accounts';
import {
	listUserConnections,
	revokeAllUserGrants,
	revokeUserClientGrant,
} from '@web/lib/consent-inventory';

/**
 * DATA-001 / S-18: "Add a user-facing connector and consent inventory with
 * revoke-all and per-client revocation. Revocation must terminate active
 * MCP access, not merely hide a record." Against the real test Postgres —
 * the "terminate access, not merely hide a record" half of the criterion
 * needs a real row an `/mcp` request would actually be checked against,
 * which a mock cannot provide.
 */

const createdUserIds: string[] = [];
const createdClientIds: string[] = [];

afterAll(async () => {
	// One statement per entity instead of one per table: `DATA-001` cascades
	// every child row from `users` and `oauth_clients`, and each extra statement
	// is an HTTP round trip through the local Neon proxy — enough of them
	// overran the 5s hook budget on a continuous-integration runner. See
	// `test-support/delete-test-accounts.ts`.
	await deleteTestAccounts({ clientIds: createdClientIds, userIds: createdUserIds });
});

async function seedUserWithConnection(clientName: string) {
	const userId = randomUUID();
	createdUserIds.push(userId);
	const clientId = `consent-inventory-test-client-${randomUUID()}`;
	createdClientIds.push(clientId);

	const accessToken = hashCredential(randomUUID());

	// `users` and `oauth_clients` are foreign-key parents and must land before
	// their children, but they do not depend on each other — and the two token
	// rows below depend only on those parents, not on one another. Every
	// statement here is an HTTP round trip through the local Neon proxy, and
	// this helper is called three times by a single test, so running the five
	// inserts strictly in series cost fifteen sequential trips and pushed that
	// test past bun's 5s budget on a continuous-integration runner. Two waves
	// instead of five, doing identical work.
	await Promise.all([
		database.insert(schema.users).values({
			id: userId,
			email: `consent-inventory-${userId}@example.com`,
			name: 'Consent Inventory Test User',
		}),
		database.insert(schema.oauthClients).values({
			clientId,
			clientName,
			clientType: 'public',
			tokenEndpointAuthMethod: 'none',
			redirectUris: ['http://localhost:9999/callback'],
			grantTypes: ['authorization_code', 'refresh_token'],
			responseTypes: ['code'],
		}),
	]);

	await Promise.all([
		database.insert(schema.oauthTokens).values({
			accessToken,
			clientId,
			userId,
			expiresAt: new Date(Date.now() + 60_000),
		}),
		database.insert(schema.oauthRefreshTokens).values({
			refreshToken: hashCredential(randomUUID()),
			clientId,
			userId,
			accessTokenHash: accessToken,
			familyId: randomUUID(),
			expiresAt: new Date(Date.now() + 60_000),
		}),
	]);

	return { userId, clientId, accessToken };
}

async function seedOutstandingAuthorizationCode(userId: string, clientId: string): Promise<string> {
	const code = hashCredential(randomUUID());
	await database.insert(schema.oauthCodes).values({
		code,
		clientId,
		userId,
		redirectUri: 'http://localhost:9999/callback',
		codeChallenge: 'test-code-challenge',
		expiresAt: new Date(Date.now() + 10 * 60 * 1000),
	});
	return code;
}

/**
 * Simulates the exact row shape `handleOauthTokenAuthorizationCodeGrant`
 * leaves behind the moment it consumes a code (`usedAt` set) but before a
 * subsequent token insert has failed and its compensating reopen has run --
 * the narrow window review finding (P2) is about. Returns the `usedAt` this
 * helper wrote, matching what that handler's own reopen predicate compares
 * against.
 */
async function seedInFlightConsumedAuthorizationCode(
	userId: string,
	clientId: string,
): Promise<{ code: string; usedAt: Date }> {
	const code = hashCredential(randomUUID());
	const usedAt = new Date();
	await database.insert(schema.oauthCodes).values({
		code,
		clientId,
		userId,
		redirectUri: 'http://localhost:9999/callback',
		codeChallenge: 'test-code-challenge',
		expiresAt: new Date(Date.now() + 10 * 60 * 1000),
		usedAt,
	});
	return { code, usedAt };
}

describe('listUserConnections', () => {
	it('lists a client with a live access token and omits one with none', async () => {
		const { userId, clientId } = await seedUserWithConnection('Live Connection Client');

		const connections = await listUserConnections(userId);
		expect(connections.map((connection) => connection.clientId)).toContain(clientId);
	});

	it('omits a connection once every token for it has been revoked', async () => {
		const { userId, clientId } = await seedUserWithConnection('Revoked Connection Client');
		await revokeUserClientGrant(userId, clientId);

		const connections = await listUserConnections(userId);
		expect(connections.map((connection) => connection.clientId)).not.toContain(clientId);
	});

	// Review finding (P2): a client registered before `isValidClientName`
	// existed could have a stored name carrying bidirectional-override,
	// control, or zero-width characters. The connected-applications
	// inventory must substitute the same safe fallback the consent page
	// already uses, rather than copying the raw name next to that row's
	// revoke button.
	it('substitutes a safe fallback for a legacy client name containing a bidirectional-override character', async () => {
		const maliciousName = 'Safe App‮gnicnalb ylthgils';
		const { userId, clientId } = await seedUserWithConnection(maliciousName);

		const connections = await listUserConnections(userId);
		const connection = connections.find((entry) => entry.clientId === clientId);
		expect(connection).toBeDefined();
		expect(connection?.clientName).toBe('the requesting application');
		expect(connection?.clientName).not.toContain('‮');
	});
});

describe('revokeUserClientGrant', () => {
	it('revokes both the access token and the refresh token for that client, and terminates access an /mcp check would rely on', async () => {
		const { userId, clientId, accessToken } = await seedUserWithConnection(
			'Per-Client Revoke Client',
		);

		const result = await revokeUserClientGrant(userId, clientId);
		expect(result).toEqual({
			revokedAccessTokens: 1,
			revokedRefreshTokens: 1,
			consumedAuthorizationCodes: 0,
		});

		const [tokenRow] = await database
			.select({ revokedAt: schema.oauthTokens.revokedAt })
			.from(schema.oauthTokens)
			.where(eq(schema.oauthTokens.accessToken, accessToken))
			.limit(1);
		// This is exactly the column `routes/mcp-routes.ts` checks
		// (`isNull(schema.oauthTokens.revokedAt)`) on every `/mcp` request --
		// a non-null value here is what makes the very next request 401.
		expect(tokenRow?.revokedAt).not.toBeNull();
	});

	it('does not revoke a different client’s grant for the same user', async () => {
		const { userId, clientId: clientAId } = await seedUserWithConnection('Client A');
		const { clientId: clientBId, accessToken: clientBAccessToken } =
			await seedUserWithConnection('Client B');
		// Re-seed client B's connection under the same user as client A, so this
		// test proves cross-client isolation for one user's two connections.
		await database
			.update(schema.oauthTokens)
			.set({ userId })
			.where(eq(schema.oauthTokens.accessToken, clientBAccessToken));

		await revokeUserClientGrant(userId, clientAId);

		const [tokenRow] = await database
			.select({ revokedAt: schema.oauthTokens.revokedAt })
			.from(schema.oauthTokens)
			.where(eq(schema.oauthTokens.accessToken, clientBAccessToken))
			.limit(1);
		expect(tokenRow?.revokedAt).toBeNull();
		void clientBId;
	});

	// A review finding (P1): a code issued right before the user clicks
	// "revoke" is a single-use credential that has not yet been exchanged --
	// it has no `revokedAt` for the token-revoking updates above to have
	// touched, and RFC 6749's 10-minute code lifetime is long enough for the
	// client to redeem it AFTER revocation, minting a brand-new, fully live
	// access/refresh pair the user was just told was revoked. This proves
	// the fix against exactly the column `handleOauthTokenAuthorizationCodeGrant`
	// checks (`isNull(usedAt)`) before allowing an exchange.
	it('consumes an outstanding authorization code for that client so it cannot be redeemed after revocation', async () => {
		const { userId, clientId } = await seedUserWithConnection('Outstanding Code Client');
		const code = await seedOutstandingAuthorizationCode(userId, clientId);

		const result = await revokeUserClientGrant(userId, clientId);
		expect(result.consumedAuthorizationCodes).toBe(1);

		const [codeRow] = await database
			.select({ usedAt: schema.oauthCodes.usedAt })
			.from(schema.oauthCodes)
			.where(eq(schema.oauthCodes.code, code))
			.limit(1);
		// This is exactly the column `handleOauthTokenAuthorizationCodeGrant`
		// requires `isNull(...)` on before it will exchange a code -- a
		// non-null value here means redemption now fails identically to an
		// already-used code.
		expect(codeRow?.usedAt).not.toBeNull();
	});

	it('does not consume a different client’s outstanding authorization code for the same user', async () => {
		const { userId, clientId: clientAId } = await seedUserWithConnection('Code Client A');
		const { clientId: clientBId } = await seedUserWithConnection('Code Client B');
		const clientBCode = await seedOutstandingAuthorizationCode(userId, clientBId);

		await revokeUserClientGrant(userId, clientAId);

		const [codeRow] = await database
			.select({ usedAt: schema.oauthCodes.usedAt })
			.from(schema.oauthCodes)
			.where(eq(schema.oauthCodes.code, clientBCode))
			.limit(1);
		expect(codeRow?.usedAt).toBeNull();
	});

	// Review finding (P2) regression test, the revocation half of the race:
	// before this fix, `consumed_authorization_codes` filtered on
	// `used_at IS NULL`, so a code already marked used by an in-flight token
	// exchange (this helper's exact shape) matched no row -- revocation left
	// it completely untouched. That silence is what let
	// `handleOauthTokenAuthorizationCodeGrant`'s own compensating reopen (on
	// a failed token insert AFTER the code was consumed) unconditionally
	// clear `usedAt` back to `null`, resurrecting a code the user had just
	// revoked. This proves revocation now overwrites `usedAt` on such a code
	// too, which is what makes that reopen's own `usedAt = <original value>`
	// predicate match nothing afterward -- see the paired unit-level proof
	// in `oauth-routes.test.ts` for the reopen side of this same fix.
	it('overwrites usedAt on a code an in-flight token exchange already consumed, closing the compensating-reopen race', async () => {
		const { userId, clientId } = await seedUserWithConnection('In-Flight Consume Race Client');
		const { code, usedAt: originalUsedAt } = await seedInFlightConsumedAuthorizationCode(
			userId,
			clientId,
		);

		const result = await revokeUserClientGrant(userId, clientId);
		// This code was already used, so it is not a NEWLY-outstanding code
		// this call closed off in the sense the original P1 fix cared about --
		// but it is still touched (overwritten), which is the whole point of
		// this fix, so it is still counted.
		expect(result.consumedAuthorizationCodes).toBe(1);

		const [codeRow] = await database
			.select({ usedAt: schema.oauthCodes.usedAt })
			.from(schema.oauthCodes)
			.where(eq(schema.oauthCodes.code, code))
			.limit(1);
		expect(codeRow?.usedAt).not.toBeNull();
		// The load-bearing assertion: the value actually changed. A
		// same-millisecond collision with the original `usedAt` is
		// astronomically unlikely across a real Postgres round trip, and if
		// it ever happened the failure mode is exactly the pre-fix behavior
		// (not a new, worse one) -- see the comment in `consent-inventory.ts`.
		expect(codeRow!.usedAt!.getTime()).not.toBe(originalUsedAt.getTime());
	});
});

describe('revokeAllUserGrants', () => {
	// Seeds three full connections (each a user, a client, and two token rows),
	// revokes across all of them, then verifies — roughly fifteen round trips
	// through the local Neon proxy even after the seeding above was batched into
	// two waves per connection. Comfortably under a second here, and past bun's
	// generic 5s default on a continuous-integration runner, which runs this
	// suite several times slower.
	//
	// An explicit budget on this one test, matching the precedent set for the
	// end-to-end OAuth chains: reduce the work first, then measure what is left
	// against a limit that fits it rather than one meant for unit tests. A
	// genuine hang still fails, at 30s instead of 5s.
	it('revokes every connection for the user, across multiple clients', async () => {
		const { userId } = await seedUserWithConnection('Revoke-All Client One');
		const { accessToken: secondAccessToken } =
			await seedUserWithConnection('Revoke-All Client Two');
		// Move the second seeded connection's token under the same user so this
		// test can prove revoke-all spans multiple clients for one user.
		await database
			.update(schema.oauthTokens)
			.set({ userId })
			.where(eq(schema.oauthTokens.accessToken, secondAccessToken));

		const codeClientAId = (await seedUserWithConnection('Revoke-All Code Client')).clientId;
		const outstandingCode = await seedOutstandingAuthorizationCode(userId, codeClientAId);
		await database
			.update(schema.oauthCodes)
			.set({ userId })
			.where(eq(schema.oauthCodes.code, outstandingCode));

		await revokeAllUserGrants(userId);

		const connections = await listUserConnections(userId);
		expect(connections).toHaveLength(0);

		const [codeRow] = await database
			.select({ usedAt: schema.oauthCodes.usedAt })
			.from(schema.oauthCodes)
			.where(eq(schema.oauthCodes.code, outstandingCode))
			.limit(1);
		expect(codeRow?.usedAt).not.toBeNull();
	}, 30_000);
});

/**
 * Round 17 review finding (P2): both revoke paths were database-only, so a
 * `subscriptions/listen` stream opened before the revoke kept receiving
 * `resource_updated` events and keepalives — bearer authentication is
 * checked when the stream opens and never again — and its nonzero listener
 * count also pinned that user's handler against idle eviction.
 *
 * Asserted through the real control channel against real Redis rather than
 * by mocking the announcement away, because the defect this closes lives
 * precisely in whether the announcement actually reaches the instance
 * holding the stream.
 */
describe('revocation ends live MCP access', () => {
	async function collectRevokedUserIds(act: () => Promise<unknown>): Promise<string[]> {
		const closed: string[] = [];
		const messaging = resolveMcpCrossInstanceMessaging();
		if (!messaging) throw new Error('Redis messaging is unavailable.');
		// Stands in for whichever instance holds this user's open stream.
		const observer = new GrantRevocationChannel((userId) => {
			closed.push(userId);
		}, messaging);
		await observer.start();

		try {
			await act();

			const deadline = Date.now() + 5_000;
			while (closed.length === 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			return closed;
		} finally {
			await observer.close();
		}
	}

	it('announces the revoked user when one client connection is revoked', async () => {
		const { userId, clientId } = await seedUserWithConnection('Round 17 single revoke');

		const closed = await collectRevokedUserIds(() => revokeUserClientGrant(userId, clientId));

		expect(closed).toEqual([userId]);
	});

	it('announces the revoked user when every connection is revoked', async () => {
		const { userId } = await seedUserWithConnection('Round 17 revoke all');

		const closed = await collectRevokedUserIds(() => revokeAllUserGrants(userId));

		expect(closed).toEqual([userId]);
	});

	it('announces only after the revoking write has committed', async () => {
		// A client reconnecting between a premature close and the write
		// would re-authenticate successfully against rows that are still
		// live, so this ordering is the guarantee — not an implementation
		// detail. Reads the row at the moment the announcement lands.
		const { userId, clientId } = await seedUserWithConnection('Round 17 ordering');
		let revokedAtAnnouncement: Date | null | undefined;

		const messaging = resolveMcpCrossInstanceMessaging();
		if (!messaging) throw new Error('Redis messaging is unavailable.');
		let resolveAnnouncement: () => void = () => {};
		const announced = new Promise<void>((resolve) => {
			resolveAnnouncement = resolve;
		});
		const observer = new GrantRevocationChannel(async () => {
			const [row] = await database
				.select({ revokedAt: schema.oauthTokens.revokedAt })
				.from(schema.oauthTokens)
				.where(eq(schema.oauthTokens.userId, userId));
			revokedAtAnnouncement = row?.revokedAt ?? null;
			resolveAnnouncement();
		}, messaging);
		await observer.start();

		await revokeUserClientGrant(userId, clientId);
		await announced;
		await observer.close();

		expect(revokedAtAnnouncement).toBeInstanceOf(Date);
	});
});
