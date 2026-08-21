import { randomUUID } from 'node:crypto';
import { describe, test, expect, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';

import { hashCredential, rotateOauthClientSecret } from './rotate-secret.ts';

/**
 * SECRETS-001 acceptance criterion 5 ("rotation tests prove old credentials stop working"),
 * genuine end-to-end version for the OAuth-client-credential class: against the real test
 * Postgres, not a mock, prove that after `rotateOauthClientSecret` runs, the pre-rotation secret
 * no longer hashes to the value stored on the row, while the new secret does. This is the exact
 * comparison `/oauth/token`'s `client_secret_post` authentication performs.
 */

const createdClientIds: string[] = [];

afterAll(async () => {
	for (const clientId of createdClientIds) {
		await database.delete(schema.oauthClients).where(eq(schema.oauthClients.clientId, clientId));
	}
});

describe('rotateOauthClientSecret', () => {
	test('the old secret stops matching the stored hash; the new secret matches it', async () => {
		const clientId = `rotation-test-client-${randomUUID()}`;
		const originalSecret = 'original-secret-value';
		createdClientIds.push(clientId);

		await database.insert(schema.oauthClients).values({
			clientId,
			clientSecret: hashCredential(originalSecret),
			clientName: 'Rotation Test Client',
			clientType: 'confidential',
			tokenEndpointAuthMethod: 'client_secret_post',
			redirectUris: ['http://localhost:9999/callback'],
			grantTypes: ['authorization_code', 'refresh_token'],
			responseTypes: ['code'],
		});

		const [beforeRotation] = await database
			.select({ clientSecret: schema.oauthClients.clientSecret })
			.from(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, clientId))
			.limit(1);
		expect(beforeRotation?.clientSecret).toBe(hashCredential(originalSecret));

		const { newSecret } = await rotateOauthClientSecret(database, schema.oauthClients, clientId);
		expect(newSecret).not.toBe(originalSecret);

		const [afterRotation] = await database
			.select({ clientSecret: schema.oauthClients.clientSecret })
			.from(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, clientId))
			.limit(1);

		// The property that actually matters: authenticating with the pre-rotation secret now
		// fails the same comparison `/oauth/token` performs...
		expect(afterRotation?.clientSecret).not.toBe(hashCredential(originalSecret));
		// ...while the newly issued secret authenticates successfully.
		expect(afterRotation?.clientSecret).toBe(hashCredential(newSecret));
	});
});
