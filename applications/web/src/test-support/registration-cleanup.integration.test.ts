import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { fetchFromTestServer, startTestServer } from '@web/test-support/start-test-server';

/**
 * OPEN-11's cleanup hook rests on behavior `bun:test` does not document: an
 * `afterEach` registered while a test is running fires exactly once, right
 * after that same test. That was confirmed empirically, and it is the right
 * choke point — but if the behavior ever changes to "never runs," the client
 * leak returns SILENTLY, which is precisely the defect OPEN-11 exists to fix.
 *
 * `start-test-server.test.ts` covers the hook's input handling (wrong method,
 * wrong path, non-201, malformed body, missing or non-string `client_id`), but
 * its positive case deliberately uses a `client_id` that does not exist, so the
 * scheduled deletion is a no-op and no assertion ever reaches the database. It
 * proves the code path is entered. It cannot prove a row is removed.
 *
 * This file closes that gap behaviorally: the first test seeds a REAL
 * `oauth_clients` row and hands its id back through a 201 on
 * `POST /oauth/register`, exactly as the real endpoint would; the second test
 * asserts the row is gone. Because the deletion happens between them, a change
 * in that undocumented scheduling fails here loudly, whatever the cause.
 */
describe('OAuth client cleanup actually deletes the row', () => {
	const seededClientId = `registration-cleanup-guard-${randomUUID()}`;

	async function countSeededClient(): Promise<number> {
		const rows = await database
			.select({ clientId: schema.oauthClients.clientId })
			.from(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, seededClientId));
		return rows.length;
	}

	// Belt-and-braces: if the dynamically-registered `afterEach` this file
	// exists to verify ever stops firing, this removes the seeded row anyway
	// so a failing run here does not also leave a live row behind for the next
	// run to trip over. Runs after both cases above without weakening either
	// assertion -- the second case still fails loudly first if the row is
	// still present.
	afterAll(async () => {
		await database
			.delete(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, seededClientId));
	});

	it('registers a real client through the helper', async () => {
		await database.insert(schema.oauthClients).values({
			clientId: seededClientId,
			clientName: 'Registration Cleanup Guard',
			clientType: 'public',
			tokenEndpointAuthMethod: 'none',
			redirectUris: ['http://localhost:9999/callback'],
			grantTypes: ['authorization_code'],
			responseTypes: ['code'],
		});
		expect(await countSeededClient()).toBe(1);

		// The shape the real `POST /oauth/register` returns, which is what
		// `fetchFromTestServer` inspects to schedule the deletion.
		const handle = startTestServer(
			async () =>
				new Response(JSON.stringify({ client_id: seededClientId }), {
					status: 201,
					headers: { 'content-type': 'application/json' },
				}),
		);
		try {
			const response = await fetchFromTestServer(handle, '/oauth/register', { method: 'POST' });
			expect(response.status).toBe(201);
		} finally {
			handle.stop();
		}

		// Still present here: the cleanup runs after this test, not during it.
		expect(await countSeededClient()).toBe(1);
	});

	it('the row is gone by the next test, without the suite ever deleting it', async () => {
		// Nothing in this file deletes the row. If this fails, the dynamically
		// registered `afterEach` did not run — the leak is back, and it is
		// visible instead of silent.
		expect(await countSeededClient()).toBe(0);
	});
});
