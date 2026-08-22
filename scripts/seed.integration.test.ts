import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';

import { hashCredential } from './rotate-secret.ts';
import { SEED_CLIENT_ID, seedOauthClient } from './seed.ts';

/**
 * Regression test for the review-thread claim on `scripts/seed.ts:53`
 * (PRRT_kwDORZ0PbM6bWUcq): the idempotency lookup used to key off the
 * freely chosen, non-unique `clientName` ("Seed Test Client"). Any
 * coincidentally-named row -- including one created by an untrusted DCR
 * caller -- would be treated as the seed client and returned in its place,
 * with the "secret not retrievable" marker, preventing `bun db:seed` from
 * ever creating usable seed credentials.
 *
 * `seedOauthClient` now looks up and inserts by a fixed, unique clientId
 * instead. Every test here calls it with its own `randomUUID()`-derived id
 * (never the real, shared `SEED_CLIENT_ID` row `bun db:seed` uses) so
 * concurrent full-suite runs -- this branch's standing verification
 * pattern, see OPEN-7 in PROGRESS.local.md -- cannot race on one shared
 * primary-key row.
 */

const createdClientIds: string[] = [];

afterEach(async () => {
	for (const clientId of createdClientIds.splice(0)) {
		await database.delete(schema.oauthClients).where(eq(schema.oauthClients.clientId, clientId));
	}
});

describe('seedOauthClient', () => {
	test('a coincidentally same-named client is never mistaken for the seed client', async () => {
		const seedClientId = `seed-test-${randomUUID()}`;
		const decoyClientId = `decoy-${randomUUID()}`;
		createdClientIds.push(decoyClientId, seedClientId);

		// An unrelated client -- e.g. from an untrusted DCR caller -- that
		// happens to choose the exact same display name the seed script uses.
		await database.insert(schema.oauthClients).values({
			clientId: decoyClientId,
			clientSecret: hashCredential('decoy-secret'),
			clientName: 'Seed Test Client',
			clientType: 'confidential',
			tokenEndpointAuthMethod: 'client_secret_post',
			redirectUris: ['http://localhost:9999/decoy-callback'],
			grantTypes: ['authorization_code', 'refresh_token'],
			responseTypes: ['code'],
		});

		const result = await seedOauthClient(seedClientId);

		expect(result.clientId).toBe(seedClientId);
		expect(result.clientId).not.toBe(decoyClientId);
		// A genuinely new seed client was created, so its secret is returned in
		// plaintext -- not silently swapped for the decoy's "not retrievable" marker.
		expect(result.clientSecret).not.toBe('(already created — secret not retrievable)');
	});

	test('is idempotent against its own previously seeded row, keyed by clientId', async () => {
		const seedClientId = `seed-test-${randomUUID()}`;
		createdClientIds.push(seedClientId);

		const first = await seedOauthClient(seedClientId);
		expect(first.clientId).toBe(seedClientId);

		const second = await seedOauthClient(seedClientId);
		expect(second.clientId).toBe(seedClientId);
		expect(second.clientSecret).toBe('(already created — secret not retrievable)');
	});
});

/**
 * `SEED_CLIENT_ID` itself -- the value `bun db:seed` actually operates on via
 * `seedOauthClient()`'s default parameter -- is asserted here only as a
 * constant, never inserted or deleted against, so this file never races a
 * concurrent suite on that one shared primary-key row.
 */
test('SEED_CLIENT_ID is the fixed id the real db:seed path defaults to', () => {
	expect(SEED_CLIENT_ID).toBe('seed-client');
});
