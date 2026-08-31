import { describe, expect, test } from 'bun:test';
import type { McpHttpHandler, ServerEvent } from '@modelcontextprotocol/server';

import type { CrossInstanceMessaging } from '../oauth/index.js';
import { GrantRevocationChannel } from './grant-revocation-channel.js';
import { McpUserHandlerCache } from './user-handler-cache.js';
import {
	CrossInstanceUserServerEventBus,
	type UserServerEventBus,
} from './user-server-event-bus.js';

function fakeBus(listenerCount = 0): UserServerEventBus {
	return { listenerCount, publish: () => {}, subscribe: () => () => {} };
}

function fakeHandler(onClose: () => void = () => {}): McpHttpHandler {
	return {
		fetch: async () => new Response(null),
		close: async () => onClose(),
		notify: {
			toolsChanged: () => {},
			promptsChanged: () => {},
			resourcesChanged: () => {},
			resourceUpdated: () => {},
		},
		bus: fakeBus(),
	};
}

function createMessagingHub(): CrossInstanceMessaging {
	const listeners = new Map<string, Set<(message: string) => void>>();
	return {
		publish: async (channel, message) => {
			for (const listener of listeners.get(channel) ?? []) listener(message);
		},
		subscribe: async (channel, listener) => {
			const channelListeners = listeners.get(channel) ?? new Set();
			channelListeners.add(listener);
			listeners.set(channel, channelListeners);
			return async () => {
				channelListeners.delete(listener);
			};
		},
	};
}

describe('McpUserHandlerCache', () => {
	test('reuses one entry per user and evicts only an idle user without a live listener', async () => {
		let now = 0;
		const closed: string[] = [];
		const cache = new McpUserHandlerCache(
			(userId) => ({
				handler: fakeHandler(() => closed.push(userId)),
				bus: fakeBus(userId === 'listening' ? 1 : 0),
			}),
			() => now,
		);
		expect(cache.get('idle')).toBe(cache.get('idle'));
		cache.get('listening');
		now = 2_000;
		expect(cache.evictIdle(1_000)).toEqual(['idle']);
		await Promise.resolve();
		expect(closed).toEqual(['idle']);
		expect(cache.peek('listening')).toBeDefined();
	});

	test('closeUser and closeAll terminate live handlers and clear the cache', async () => {
		const closed: string[] = [];
		const cache = new McpUserHandlerCache((userId) => ({
			handler: fakeHandler(() => closed.push(userId)),
			bus: fakeBus(),
		}));
		cache.get('revoked');
		cache.get('shutdown');
		expect(await cache.closeUser('revoked')).toBeTrue();
		expect(await cache.closeUser('missing')).toBeFalse();
		await cache.closeAll();
		expect(closed.sort()).toEqual(['revoked', 'shutdown']);
		expect(cache.size).toBe(0);
	});

	test('startSweep replaces its timer and closeAll stops it', async () => {
		let now = 0;
		const cache = new McpUserHandlerCache(
			() => ({ handler: fakeHandler(), bus: fakeBus() }),
			() => now,
		);
		cache.get('user');
		cache.startSweep(5, 10);
		now = 20;
		await new Promise((resolve) => setTimeout(resolve, 15));
		expect(cache.size).toBe(0);
		await cache.closeAll();
	});
});

describe('cross-instance MCP lifecycle', () => {
	test('reports an unserializable event without throwing synchronously', () => {
		const operations: string[] = [];
		const bus = new CrossInstanceUserServerEventBus(
			'user-a',
			createMessagingHub(),
			({ operation }) => operations.push(operation),
		);
		const circular: Record<string, unknown> = { kind: 'resources_list_changed' };
		circular['self'] = circular;
		expect(() => bus.publish(circular as unknown as ServerEvent)).not.toThrow();
		expect(operations).toEqual(['publish']);
	});

	test('delivers an event across instances only to the matching user bus', async () => {
		const messaging = createMessagingHub();
		const publisher = new CrossInstanceUserServerEventBus('user-a', messaging);
		const remoteUserA = new CrossInstanceUserServerEventBus('user-a', messaging);
		const remoteUserB = new CrossInstanceUserServerEventBus('user-b', messaging);
		const receivedByA: ServerEvent[] = [];
		const receivedByB: ServerEvent[] = [];
		remoteUserA.subscribe((event) => receivedByA.push(event));
		remoteUserB.subscribe((event) => receivedByB.push(event));
		await Promise.all([remoteUserA.whenSubscribed(), remoteUserB.whenSubscribed()]);
		publisher.publish({ kind: 'resource_updated', uri: 'user://profile' });
		await Promise.resolve();
		expect(receivedByA).toEqual([{ kind: 'resource_updated', uri: 'user://profile' }]);
		expect(receivedByB).toEqual([]);
	});

	test('closes a remote instance handler after grant revocation', async () => {
		const messaging = createMessagingHub();
		const closed: string[] = [];
		const remote = new GrantRevocationChannel((userId) => closed.push(userId), messaging);
		const publisher = new GrantRevocationChannel(() => {}, messaging);
		await remote.start();
		await publisher.publish('revoked-user');
		expect(closed).toEqual(['revoked-user']);
		await remote.close();
	});

	test('falls back to local closure when no cross-instance seam exists', async () => {
		const closed: string[] = [];
		const channel = new GrantRevocationChannel((userId) => closed.push(userId));
		await channel.publish('local-user');
		expect(closed).toEqual(['local-user']);
	});
});
