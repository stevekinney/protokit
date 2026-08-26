import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import { createClient } from 'redis';
import type { ServerEvent } from '@modelcontextprotocol/server';
import { RedisUserServerEventBus, createUserServerEventBus } from '@web/lib/mcp-user-event-bus';
import { publishUserResourceUpdate } from '@web/lib/mcp-handler';
import { getRedisSubscriberClient } from '@web/lib/redis-client';

// The bus publishes on a Redis channel named for the user, and Redis is shared
// across concurrent test runs — so fixed identifiers let one run's published
// event arrive at another run's listener and fail the very isolation assertion
// this file exists to make. Namespacing per run keeps the assertion honest.
const busRunId = randomUUID();

/**
 * PROTO-002 / S-11 regression coverage for the bus itself: proves the
 * per-user Redis channel actually isolates delivery, independent of
 * anything `mcp-handler.ts`/the SDK's listen router does on top. The
 * end-to-end proof through a real MCP client's `subscriptions/listen`
 * stream lives in `mcp-handler.test.ts`.
 */

let redisAvailable: boolean;
try {
	const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
	const probe = createClient({
		url: redisUrl,
		socket: { reconnectStrategy: false, connectTimeout: 2000 },
	});
	try {
		await probe.connect();
		await probe.ping();
		redisAvailable = true;
	} finally {
		await probe.disconnect().catch(() => {});
	}
} catch {
	redisAvailable = false;
}

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

function waitForEvent(collected: ServerEvent[], count: number, timeoutMs = 2000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const check = () => {
			if (collected.length >= count) {
				resolve();
				return;
			}
			if (Date.now() - start > timeoutMs) {
				reject(new Error(`Timed out waiting for ${count} event(s); got ${collected.length}`));
				return;
			}
			setTimeout(check, 10);
		};
		check();
	});
}

describeWithRedis('RedisUserServerEventBus (requires Redis)', () => {
	it("delivers a published event only to listeners on the SAME user bus, never a different user's bus", async () => {
		const busA = new RedisUserServerEventBus(`user-bus-a-${busRunId}`);
		const busB = new RedisUserServerEventBus(`user-bus-b-${busRunId}`);

		const receivedByA: ServerEvent[] = [];
		const receivedByB: ServerEvent[] = [];
		const unsubscribeA = busA.subscribe((event) => receivedByA.push(event));
		const unsubscribeB = busB.subscribe((event) => receivedByB.push(event));
		await Promise.all([busA.whenSubscribed(), busB.whenSubscribed()]);

		// Same literal URI on both — the resource address every user's
		// client actually uses (`user://profile`) is not itself unique per
		// user; isolation must come from the bus, not the URI string.
		busA.publish({ kind: 'resource_updated', uri: 'user://profile' });

		await waitForEvent(receivedByA, 1);
		// Give any (incorrect) cross-delivery a moment to arrive before
		// asserting its absence.
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(receivedByA).toEqual([{ kind: 'resource_updated', uri: 'user://profile' }]);
		expect(receivedByB).toEqual([]);

		unsubscribeA();
		unsubscribeB();
	});

	it('reports listenerCount and stops delivering after the last listener unsubscribes', async () => {
		const bus = new RedisUserServerEventBus(`user-bus-c-${busRunId}`);
		expect(bus.listenerCount).toBe(0);

		const received: ServerEvent[] = [];
		const unsubscribe = bus.subscribe((event) => received.push(event));
		expect(bus.listenerCount).toBe(1);
		await bus.whenSubscribed();

		bus.publish({ kind: 'resources_list_changed' });
		await waitForEvent(received, 1);

		unsubscribe();
		expect(bus.listenerCount).toBe(0);

		bus.publish({ kind: 'resources_list_changed' });
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(received.length).toBe(1);
	});
});

describeWithRedis('RedisUserServerEventBus subscribe/unsubscribe race (requires Redis)', () => {
	// A review finding (P2): `subscribe()` must stay synchronous, so it
	// kicks off the real Redis `SUBSCRIBE` in the background and returns a
	// teardown function immediately. If the caller unsubscribes before that
	// `SUBSCRIBE` round trip finishes, the teardown function found
	// `redisSubscribed` still `false` and did nothing — the in-flight
	// `SUBSCRIBE` then completed afterward and set `redisSubscribed = true`
	// with zero listeners left, leaking the Redis channel subscription
	// forever (nothing else ever calls `teardownRedisSubscription` again
	// for a bus whose `listenerCount` never rises above zero afterward).
	// Proven against real Redis's own bookkeeping (`PUBSUB CHANNELS`), not
	// merely this bus's own internal state, so a fix that satisfies the
	// bus's own flags without actually issuing `UNSUBSCRIBE` would not pass
	// this test.
	it('does not leak a Redis channel subscription when the last listener unsubscribes before SUBSCRIBE completes', async () => {
		const bus = new RedisUserServerEventBus(`user-bus-race-${busRunId}`);
		const channel = `mcp:events:user:user-bus-race-${busRunId}`;

		const unsubscribe = bus.subscribe(() => {});
		// Unsubscribe synchronously, in the same tick `subscribe()` returned
		// in -- before the background `SUBSCRIBE` has any chance to finish.
		unsubscribe();
		expect(bus.listenerCount).toBe(0);

		// Let the in-flight SUBSCRIBE (and this fix's post-subscribe
		// teardown check) actually settle.
		await bus.whenSubscribed();
		// Give the teardown's own `UNSUBSCRIBE` round trip a moment to land.
		await new Promise((resolve) => setTimeout(resolve, 200));

		const inspector = createClient({ url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
		await inspector.connect();
		try {
			const subscribedChannels = await inspector.pubSubChannels(channel);
			expect(subscribedChannels).toEqual([]);
		} finally {
			await inspector.disconnect().catch(() => {});
		}
	});

	// A review finding (P2): the reverse race. The LAST listener
	// unsubscribes (kicking off a teardown `UNSUBSCRIBE` in the
	// background) and a REPLACEMENT listener subscribes before that
	// teardown settles. The old implementation let the replacement's
	// `SUBSCRIBE` and the old listener's `UNSUBSCRIBE` race independently;
	// if the `UNSUBSCRIBE` landed after the `SUBSCRIBE`, the bus's own
	// `redisSubscribed` flag stayed `true` while Redis itself had no
	// subscription at all, so the replacement listener silently stopped
	// receiving events. Proven functionally (an actual published event
	// must reach the replacement listener), not just via the bus's own
	// internal flags, so a fix that merely reorders internal state without
	// fixing real delivery would not pass this test.
	it('keeps delivering to a replacement listener that subscribes before the previous teardown settles', async () => {
		const bus = new RedisUserServerEventBus(`user-bus-replace-${busRunId}`);

		const firstUnsubscribe = bus.subscribe(() => {});
		// Tear the first (and only) listener down, then immediately attach
		// a replacement -- both synchronously, in the same tick, before
		// either transition has any chance to touch Redis.
		firstUnsubscribe();
		const received: ServerEvent[] = [];
		bus.subscribe((event) => received.push(event));
		expect(bus.listenerCount).toBe(1);

		// Wait for every queued transition (unsubscribe, then resubscribe)
		// to genuinely settle against Redis.
		await bus.whenSubscribed();

		bus.publish({ kind: 'resources_list_changed' });
		await waitForEvent(received, 1);

		expect(received).toEqual([{ kind: 'resources_list_changed' }]);
	});
});

describeWithRedis(
	'RedisUserServerEventBus resubscribe retry after a transient SUBSCRIBE failure (requires Redis)',
	() => {
		// A review finding (P2): a transient Redis `SUBSCRIBE` failure left
		// `redisSubscribed` false with nothing scheduled to try again, while
		// the listener stayed registered -- so a `subscriptions/listen`
		// stream stayed open forever, silently receiving nothing, even after
		// Redis recovered. Injects a client factory that fails exactly once
		// before delegating to the real Redis subscriber client, so this
		// proves the bus retries on its own and resumes real event delivery
		// -- not merely that some internal flag flips back to `true`.
		it('retries after a failed SUBSCRIBE and resumes delivering real events', async () => {
			let attempts = 0;
			const flakyGetSubscriberClient: typeof getRedisSubscriberClient = async () => {
				attempts += 1;
				if (attempts === 1) {
					throw new Error('simulated transient SUBSCRIBE failure');
				}
				return getRedisSubscriberClient();
			};

			const bus = new RedisUserServerEventBus(
				`user-bus-retry-${busRunId}`,
				flakyGetSubscriberClient,
			);
			const received: ServerEvent[] = [];
			bus.subscribe((event) => received.push(event));

			// The first attempt fails immediately; the failed transition still
			// settles (it catches internally rather than throwing).
			await bus.whenSubscribed();
			expect(attempts).toBe(1);

			// Wait past the initial retry backoff for the scheduled retry to
			// fire and enqueue a fresh transition, then wait for that one to
			// settle too.
			await new Promise((resolve) => setTimeout(resolve, 1200));
			await bus.whenSubscribed();
			expect(attempts).toBeGreaterThanOrEqual(2);

			bus.publish({ kind: 'resources_list_changed' });
			await waitForEvent(received, 1);
			expect(received).toEqual([{ kind: 'resources_list_changed' }]);
		}, 10000);
	},
);

describeWithRedis('RedisUserServerEventBus#publish error handling (requires Redis)', () => {
	it('swallows a publish-time failure (e.g. an unserializable event) instead of throwing or crashing the process', async () => {
		const bus = new RedisUserServerEventBus(`user-bus-publish-error-${busRunId}`);

		// `JSON.stringify` throws on a circular structure -- that throw
		// happens inside the `.then` of `publish()`'s promise chain, so this
		// exercises the same `.catch` branch a real Redis command failure
		// would, without needing to sever the connection to a shared Redis
		// instance other tests still depend on.
		const circular: Record<string, unknown> = { kind: 'resources_list_changed' };
		circular['self'] = circular;

		expect(() => bus.publish(circular as unknown as ServerEvent)).not.toThrow();

		// Give the rejected promise's `.catch` a tick to run so an unhandled
		// rejection would surface here rather than being silently missed.
		await new Promise((resolve) => setTimeout(resolve, 50));
	});
});

describe('createUserServerEventBus', () => {
	it('exposes listenerCount whether backed by Redis or the in-memory fallback', () => {
		const bus = createUserServerEventBus(`user-factory-test-${busRunId}`);
		expect(bus.listenerCount).toBe(0);
		const unsubscribe = bus.subscribe(() => {});
		expect(bus.listenerCount).toBe(1);
		unsubscribe();
		expect(bus.listenerCount).toBe(0);
	});
});

// Review finding (P2): before this fix, no production code path ever
// called `publishResourceUpdate`/`bus.publish` for a real profile
// mutation, so a client that subscribed to `user://profile` received the
// capability advertisement but no update, ever. This proves the fix's
// actual delivery mechanism -- a fresh bus constructed for the same
// `userId` elsewhere in the process reaches an already-open subscription,
// matching `google-authentication-routes.ts`'s call site, which does not
// hold a reference to the subscriber's own bus instance.
describeWithRedis('publishUserResourceUpdate (requires Redis)', () => {
	it('delivers a resource_updated event to an independently-constructed listener for the same user', async () => {
		const userId = `user-profile-publish-${busRunId}`;
		const listenerBus = new RedisUserServerEventBus(userId);
		const collected: ServerEvent[] = [];
		const unsubscribe = listenerBus.subscribe((event) => collected.push(event));
		try {
			await listenerBus.whenSubscribed();

			publishUserResourceUpdate(userId, 'user://profile');

			await waitForEvent(collected, 1);
			expect(collected).toEqual([{ kind: 'resource_updated', uri: 'user://profile' }]);
		} finally {
			unsubscribe();
			await getRedisSubscriberClient()
				.then((client) => client.unsubscribe(`mcp:events:user:${userId}`))
				.catch(() => {});
		}
	});
});
