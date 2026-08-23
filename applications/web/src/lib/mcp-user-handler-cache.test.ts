import { describe, expect, it } from 'bun:test';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { McpUserHandlerCache } from '@web/lib/mcp-user-handler-cache';
import type { UserServerEventBus } from '@web/lib/mcp-user-event-bus';

/**
 * PROTO-002: bounds the in-process per-user handler registry (see the
 * class comment in `mcp-user-handler-cache.ts` for why one exists per
 * user in the first place — S-11). This file proves the eviction policy
 * itself, in isolation from real Redis/the SDK, using fake time and fake
 * handler/bus stubs so it is fast and deterministic.
 */

function fakeBus(listenerCount = 0): UserServerEventBus {
	return {
		listenerCount,
		publish: () => {},
		subscribe: () => () => {},
	};
}

function fakeHandler(): { handler: McpHttpHandler; closed: boolean } {
	const state = { closed: false };
	const handler: McpHttpHandler = {
		fetch: async () => new Response(null),
		close: async () => {
			state.closed = true;
		},
		notify: {
			toolsChanged: () => {},
			promptsChanged: () => {},
			resourcesChanged: () => {},
			resourceUpdated: () => {},
		},
		bus: fakeBus(),
	};
	return { handler, closed: state.closed };
}

describe('McpUserHandlerCache', () => {
	it('creates one entry per user and reuses it on subsequent lookups', () => {
		let createCount = 0;
		const cache = new McpUserHandlerCache(() => {
			createCount += 1;
			return { handler: fakeHandler().handler, bus: fakeBus() };
		});

		const first = cache.get('user-a');
		const second = cache.get('user-a');
		expect(first).toBe(second);
		expect(createCount).toBe(1);

		cache.get('user-b');
		expect(createCount).toBe(2);
		expect(cache.size).toBe(2);
	});

	it('evicts and closes an entry only when idle AND with no open listen stream', async () => {
		let now = 0;
		const closedFlags = new Map<string, { closed: boolean }>();
		const cache = new McpUserHandlerCache(
			(userId) => {
				const stub = fakeHandler();
				const flag = { closed: false };
				closedFlags.set(userId, flag);
				const handler: McpHttpHandler = {
					...stub.handler,
					close: async () => {
						flag.closed = true;
					},
				};
				return { handler, bus: fakeBus(userId === 'busy-user' ? 1 : 0) };
			},
			() => now,
		);

		cache.get('idle-user');
		cache.get('busy-user');
		expect(cache.size).toBe(2);

		// Not idle yet — nothing evicted.
		now = 100;
		expect(cache.evictIdle(1000)).toEqual([]);
		expect(cache.size).toBe(2);

		// Past the idle threshold: `idle-user` (no open listen stream) is
		// evicted and closed; `busy-user` (listenerCount > 0) survives even
		// though it is equally idle by last-access time.
		now = 2000;
		const evicted = cache.evictIdle(1000);
		expect(evicted).toEqual(['idle-user']);
		expect(cache.size).toBe(1);

		await Promise.resolve(); // let the fire-and-forget close() settle
		expect(closedFlags.get('idle-user')?.closed).toBe(true);
		expect(closedFlags.get('busy-user')?.closed).toBe(false);
	});

	it('get() refreshes lastAccessedAt, so a recently used entry survives a sweep an idle one would not', () => {
		let now = 0;
		const cache = new McpUserHandlerCache(
			() => ({ handler: fakeHandler().handler, bus: fakeBus() }),
			() => now,
		);

		cache.get('user-a');
		now = 500;
		cache.get('user-a'); // touch it again — resets the idle clock

		now = 1200; // 700ms since the touch, but only 700ms — still under 1000ms
		expect(cache.evictIdle(1000)).toEqual([]);
		expect(cache.size).toBe(1);
	});

	it('closeAll closes every entry and empties the cache', async () => {
		const closedFlags: { closed: boolean }[] = [];
		const cache = new McpUserHandlerCache(() => {
			const flag = { closed: false };
			closedFlags.push(flag);
			const handler: McpHttpHandler = {
				fetch: async () => new Response(null),
				close: async () => {
					flag.closed = true;
				},
				notify: {
					toolsChanged: () => {},
					promptsChanged: () => {},
					resourcesChanged: () => {},
					resourceUpdated: () => {},
				},
				bus: fakeBus(),
			};
			return { handler, bus: fakeBus() };
		});

		cache.get('user-a');
		cache.get('user-b');
		expect(cache.size).toBe(2);

		await cache.closeAll();

		expect(cache.size).toBe(0);
		expect(closedFlags.every((flag) => flag.closed)).toBe(true);
	});
});

/**
 * Round 17 review finding (P2): revoking a grant was a database-only
 * operation, so a `subscriptions/listen` stream opened before the revoke
 * kept receiving events indefinitely — bearer authentication is checked
 * only when the stream opens — and its nonzero listener count also pinned
 * the entry against idle eviction, which is what these tests pin down.
 */
describe('McpUserHandlerCache#closeUser', () => {
	function cacheWithClosableHandlers() {
		const closed: string[] = [];
		const cache = new McpUserHandlerCache((userId) => ({
			handler: {
				fetch: async () => new Response(null),
				close: async () => {
					closed.push(userId);
				},
				notify: {
					toolsChanged: () => {},
					promptsChanged: () => {},
					resourcesChanged: () => {},
					resourceUpdated: () => {},
				},
				bus: fakeBus(),
			} as unknown as McpHttpHandler,
			// A live `subscriptions/listen` stream — the exact state that
			// makes idle eviction refuse to touch this entry.
			bus: fakeBus(1),
		}));
		return { cache, closed };
	}

	it('closes and forgets the handler of a user whose grants were revoked', async () => {
		const { cache, closed } = cacheWithClosableHandlers();
		cache.get('user-1');

		expect(await cache.closeUser('user-1')).toBe(true);

		expect(closed).toEqual(['user-1']);
		expect(cache.size).toBe(0);
	});

	it('closes a handler idle eviction would never reclaim', async () => {
		// The listener count is nonzero, so `evictIdle` deliberately leaves
		// this entry alone no matter how much time passes. Revocation has to
		// be able to close it anyway.
		const { cache, closed } = cacheWithClosableHandlers();
		cache.get('user-1');

		expect(cache.evictIdle(0)).toEqual([]);
		await cache.closeUser('user-1');

		expect(closed).toEqual(['user-1']);
	});

	it('leaves every other user connected', async () => {
		const { cache, closed } = cacheWithClosableHandlers();
		cache.get('user-1');
		cache.get('user-2');

		await cache.closeUser('user-1');

		expect(closed).toEqual(['user-1']);
		expect(cache.size).toBe(1);
	});

	it('reports that nothing was closed when this instance holds no entry', async () => {
		// The common multi-instance case: the revoke lands on an instance
		// that never served this user an MCP request.
		const { cache, closed } = cacheWithClosableHandlers();

		expect(await cache.closeUser('user-1')).toBe(false);
		expect(closed).toEqual([]);
	});

	it('still forgets the entry when the handler fails to close', async () => {
		const cache = new McpUserHandlerCache(() => ({
			handler: {
				fetch: async () => new Response(null),
				close: async () => {
					throw new Error('close failed');
				},
				notify: {
					toolsChanged: () => {},
					promptsChanged: () => {},
					resourcesChanged: () => {},
					resourceUpdated: () => {},
				},
				bus: fakeBus(),
			} as unknown as McpHttpHandler,
			bus: fakeBus(1),
		}));
		cache.get('user-1');

		// A close failure must not leave a revoked user's entry behind for
		// the next request to reuse.
		expect(await cache.closeUser('user-1')).toBe(true);
		expect(cache.size).toBe(0);
	});
});
