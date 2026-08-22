import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import { createClient } from 'redis';
import type { ServerEvent } from '@modelcontextprotocol/server';
import { RedisUserServerEventBus, createUserServerEventBus } from '@web/lib/mcp-user-event-bus';

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
