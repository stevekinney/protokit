import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	grantRevocationTestHooks,
	publishGrantRevocation,
	subscribeToGrantRevocations,
} from '@web/lib/mcp-grant-revocation-channel';

/**
 * Round 17 review finding (P2). Closing the local handler cache is not
 * enough on its own: `RedisUserServerEventBus` fans out over Redis, so the
 * revoked user's open `subscriptions/listen` stream may be held by a
 * different instance than the one processing the revocation — the very
 * "correctness never depends on any single instance" property
 * `mcp-user-handler-cache.ts` documents is what defeats a local-only close.
 *
 * These run against the real Redis in the local test stack, because an
 * in-memory stub of pub/sub would prove nothing about the cross-instance
 * delivery this exists to establish.
 */
describe('MCP grant revocation control channel', () => {
	beforeEach(() => {
		grantRevocationTestHooks.reset();
	});

	afterEach(() => {
		// Only the closer registry is reset. The Redis subscription itself is
		// per process by design (see `redisSubscriptionStarted`), and the
		// subscriber client is shared with every other Redis-backed feature —
		// disconnecting it here would tear down state this suite does not own.
		grantRevocationTestHooks.reset();
	});

	async function waitForClosedUsers(closed: string[], expected: number): Promise<void> {
		const deadline = Date.now() + 5_000;
		while (closed.length < expected && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}

	it('delivers a revocation announced by another instance', async () => {
		// A subscriber registered here stands in for a second process
		// holding the open stream; the publish stands in for the instance
		// that served the revoke request.
		const closed: string[] = [];
		subscribeToGrantRevocations((userId) => {
			closed.push(userId);
		});
		// Let the SUBSCRIBE settle before publishing — Redis drops a publish
		// to a channel with no subscriber, which would otherwise make this a
		// timing-dependent test rather than a behavioral one.
		await new Promise((resolve) => setTimeout(resolve, 250));

		await publishGrantRevocation('user-revoked');
		await waitForClosedUsers(closed, 1);

		expect(closed).toEqual(['user-revoked']);
	});

	it('reaches the announcing instance itself', async () => {
		// The instance serving the revoke must also drop its own streams; it
		// receives its own publish through its separate subscriber
		// connection, so it needs no special-casing.
		const closed: string[] = [];
		subscribeToGrantRevocations((userId) => {
			closed.push(userId);
		});
		await new Promise((resolve) => setTimeout(resolve, 250));

		await publishGrantRevocation('self-revoked');
		await waitForClosedUsers(closed, 1);

		expect(closed).toContain('self-revoked');
	});

	it('ignores a malformed payload rather than closing an arbitrary handler', async () => {
		const closed: string[] = [];
		subscribeToGrantRevocations((userId) => {
			closed.push(userId);
		});
		await new Promise((resolve) => setTimeout(resolve, 250));

		const { getRedisClient } = await import('@web/lib/redis-client');
		const client = await getRedisClient();
		await client.publish(grantRevocationTestHooks.channelName, 'not json');
		await client.publish(grantRevocationTestHooks.channelName, JSON.stringify({ userId: 42 }));
		await publishGrantRevocation('real-user');
		await waitForClosedUsers(closed, 1);

		expect(closed).toEqual(['real-user']);
	});
});
