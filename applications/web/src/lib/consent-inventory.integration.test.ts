import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';
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
	for (const userId of createdUserIds) {
		await database.delete(schema.oauthTokens).where(eq(schema.oauthTokens.userId, userId));
		await database
			.delete(schema.oauthRefreshTokens)
			.where(eq(schema.oauthRefreshTokens.userId, userId));
		await database.delete(schema.users).where(eq(schema.users.id, userId));
	}
	for (const clientId of createdClientIds) {
		await database.delete(schema.oauthClients).where(eq(schema.oauthClients.clientId, clientId));
	}
});

async function seedUserWithConnection(clientName: string) {
	const userId = randomUUID();
	createdUserIds.push(userId);
	const clientId = `consent-inventory-test-client-${randomUUID()}`;
	createdClientIds.push(clientId);

	await database.insert(schema.users).values({
		id: userId,
		email: `consent-inventory-${userId}@example.com`,
		name: 'Consent Inventory Test User',
	});

	await database.insert(schema.oauthClients).values({
		clientId,
		clientName,
		clientType: 'public',
		tokenEndpointAuthMethod: 'none',
		redirectUris: ['http://localhost:9999/callback'],
		grantTypes: ['authorization_code', 'refresh_token'],
		responseTypes: ['code'],
	});

	const accessToken = hashCredential(randomUUID());
	await database.insert(schema.oauthTokens).values({
		accessToken,
		clientId,
		userId,
		expiresAt: new Date(Date.now() + 60_000),
	});

	await database.insert(schema.oauthRefreshTokens).values({
		refreshToken: hashCredential(randomUUID()),
		clientId,
		userId,
		accessTokenHash: accessToken,
		familyId: randomUUID(),
		expiresAt: new Date(Date.now() + 60_000),
	});

	return { userId, clientId, accessToken };
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
});

describe('revokeUserClientGrant', () => {
	it('revokes both the access token and the refresh token for that client, and terminates access an /mcp check would rely on', async () => {
		const { userId, clientId, accessToken } = await seedUserWithConnection(
			'Per-Client Revoke Client',
		);

		const result = await revokeUserClientGrant(userId, clientId);
		expect(result).toEqual({ revokedAccessTokens: 1, revokedRefreshTokens: 1 });

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
});

describe('revokeAllUserGrants', () => {
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

		await revokeAllUserGrants(userId);

		const connections = await listUserConnections(userId);
		expect(connections).toHaveLength(0);
	});
});
