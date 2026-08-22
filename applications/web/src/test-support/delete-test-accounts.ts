import { inArray } from 'drizzle-orm';
import { database, schema } from '@template/database';

/**
 * Removes the users and OAuth clients a test seeded, and lets the database
 * remove everything hanging off them.
 *
 * `DATA-001` gave every child relationship `onDelete: 'cascade'` from `users`
 * and `oauth_clients` — sessions, linked Google accounts, authorization
 * transactions, codes, access tokens, refresh tokens, and consent records. So a
 * cleanup hook does not need to walk each table itself. Doing so was not merely
 * redundant: every statement is a separate HTTP round trip through the local
 * Neon proxy, and files were issuing seven to twelve of them per hook. That fits
 * inside the 5-second hook budget on a developer machine and does not on a
 * continuous-integration runner, where the same suite takes roughly fifteen
 * times as long — which is exactly how this surfaced, as an `(unnamed)` test
 * failing with "a beforeEach/afterEach hook timed out".
 *
 * Two statements now, regardless of how many rows or tables are involved.
 * Batching is the fix; raising the hook timeout would have hidden a real
 * inefficiency and postponed the same failure to the next slower runner.
 *
 * Clients are deleted before users only for determinism — either order works,
 * since both cascade independently.
 */
export async function deleteTestAccounts(input: {
	clientIds?: readonly string[];
	userIds?: readonly string[];
}): Promise<void> {
	const clientIds = input.clientIds?.filter(Boolean) ?? [];
	const userIds = input.userIds?.filter(Boolean) ?? [];

	if (clientIds.length > 0) {
		await database
			.delete(schema.oauthClients)
			.where(inArray(schema.oauthClients.clientId, [...clientIds]));
	}

	if (userIds.length > 0) {
		await database.delete(schema.users).where(inArray(schema.users.id, [...userIds]));
	}
}
