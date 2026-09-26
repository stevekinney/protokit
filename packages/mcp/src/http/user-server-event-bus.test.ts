import { describe, expect, test } from 'bun:test';
import type { ServerEvent } from '@modelcontextprotocol/server';

import type { CrossInstanceMessaging } from '../oauth/index.js';
import {
	CrossInstanceUserServerEventBus,
	type McpMessagingError,
} from './user-server-event-bus.js';

const secretPayloadMarker = 'secret-marker-never-log';

function createMessagingCapture(): {
	messaging: CrossInstanceMessaging;
	publishedMessages: string[];
	publish(message: string): void;
} {
	const listeners = new Set<(message: string) => void>();
	const publishedMessages: string[] = [];
	return {
		messaging: {
			publish: async (_channel, message) => {
				publishedMessages.push(message);
				for (const listener of listeners) listener(message);
			},
			subscribe: async (_channel, listener) => {
				listeners.add(listener);
				return async () => {
					listeners.delete(listener);
				};
			},
		},
		publishedMessages,
		publish(message) {
			for (const listener of listeners) listener(message);
		},
	};
}

function validEvents(): ServerEvent[] {
	return [
		{ kind: 'tools_list_changed' },
		{ kind: 'prompts_list_changed' },
		{ kind: 'resources_list_changed' },
		{ kind: 'resource_updated', uri: 'user://profile' },
	];
}

async function unsubscribeAndSettle(unsubscribe: () => void, bus: CrossInstanceUserServerEventBus) {
	unsubscribe();
	await bus.whenSubscribed();
}

function assertSafeDiagnostics(
	errors: readonly Parameters<McpMessagingError>[0][],
	expectedCount: number,
): void {
	expect(errors).toHaveLength(expectedCount);
	for (const error of errors) {
		expect(error.operation).toBe('deserialize');
		expect(error.userId).toBe('user-a');
		const text = String(error.error);
		expect(text.includes('unknown_kind')).toBeFalse();
		expect(text.includes('user://profile')).toBeFalse();
		expect(text.includes(secretPayloadMarker)).toBeFalse();
	}
}

describe('CrossInstanceUserServerEventBus event decoding', () => {
	test('delivers each supported bare server event shape from another instance', async () => {
		const { messaging, publish } = createMessagingCapture();
		const bus = new CrossInstanceUserServerEventBus('user-a', messaging);
		const received: ServerEvent[] = [];
		const unsubscribe = bus.subscribe((event) => received.push(event));
		await bus.whenSubscribed();
		try {
			for (const event of validEvents()) publish(JSON.stringify(event));

			expect(received).toEqual(validEvents());
		} finally {
			await unsubscribeAndSettle(unsubscribe, bus);
		}
	});

	test('delivers each supported enveloped server event shape from another instance', async () => {
		const { messaging, publish } = createMessagingCapture();
		const bus = new CrossInstanceUserServerEventBus('user-a', messaging);
		const received: ServerEvent[] = [];
		const unsubscribe = bus.subscribe((event) => received.push(event));
		await bus.whenSubscribed();
		try {
			for (const event of validEvents()) {
				publish(JSON.stringify({ event, sourceId: 'remote-source' }));
			}

			expect(received).toEqual(validEvents());
		} finally {
			await unsubscribeAndSettle(unsubscribe, bus);
		}
	});

	test('suppresses self-origin events in both bare and enveloped forms', async () => {
		const { messaging, publishedMessages, publish } = createMessagingCapture();
		const bus = new CrossInstanceUserServerEventBus('user-a', messaging);
		const received: ServerEvent[] = [];
		const unsubscribe = bus.subscribe((event) => received.push(event));
		await bus.whenSubscribed();
		try {
			bus.publish({ kind: 'resource_updated', uri: 'user://profile' });
			await Promise.resolve();
			expect(received).toEqual([{ kind: 'resource_updated', uri: 'user://profile' }]);
			const selfSourceId = (JSON.parse(publishedMessages[0] ?? '{}') as { sourceId?: unknown })
				.sourceId;
			expect(typeof selfSourceId).toBe('string');

			publish(JSON.stringify({ event: { kind: 'tools_list_changed' }, sourceId: selfSourceId }));
			expect(received).toEqual([{ kind: 'resource_updated', uri: 'user://profile' }]);
		} finally {
			await unsubscribeAndSettle(unsubscribe, bus);
		}
	});

	test('drops malformed bare events with one safe deserialize diagnostic per message', async () => {
		const { messaging, publish } = createMessagingCapture();
		const errors: Parameters<McpMessagingError>[0][] = [];
		const bus = new CrossInstanceUserServerEventBus('user-a', messaging, (error) =>
			errors.push(error),
		);
		const received: ServerEvent[] = [];
		const unsubscribe = bus.subscribe((event) => received.push(event));
		await bus.whenSubscribed();
		try {
			const malformedMessages = [
				`{"${secretPayloadMarker}":`,
				'null',
				'42',
				'"resource_updated"',
				'[]',
				JSON.stringify({}),
				JSON.stringify({
					kind: 'unknown_kind',
					uri: 'user://profile',
					secret: secretPayloadMarker,
				}),
				JSON.stringify({ kind: 7, uri: 'user://profile', secret: secretPayloadMarker }),
				JSON.stringify({ kind: 'resource_updated', secret: secretPayloadMarker }),
				JSON.stringify({ kind: 'resource_updated', uri: 7, secret: secretPayloadMarker }),
			];

			for (const [index, message] of malformedMessages.entries()) {
				publish(message);
				expect(received).toEqual([]);
				assertSafeDiagnostics(errors, index + 1);
			}
		} finally {
			await unsubscribeAndSettle(unsubscribe, bus);
		}
	});

	test('drops malformed enveloped events with one safe deserialize diagnostic per message', async () => {
		const { messaging, publish } = createMessagingCapture();
		const errors: Parameters<McpMessagingError>[0][] = [];
		const bus = new CrossInstanceUserServerEventBus('user-a', messaging, (error) =>
			errors.push(error),
		);
		const received: ServerEvent[] = [];
		const unsubscribe = bus.subscribe((event) => received.push(event));
		await bus.whenSubscribed();
		try {
			const malformedMessages = [
				JSON.stringify({ event: { kind: 'tools_list_changed' }, secret: secretPayloadMarker }),
				JSON.stringify({
					event: { kind: 'tools_list_changed' },
					sourceId: 7,
					secret: secretPayloadMarker,
				}),
				JSON.stringify({ event: null, sourceId: 'remote-source', secret: secretPayloadMarker }),
				JSON.stringify({ event: [], sourceId: 'remote-source', secret: secretPayloadMarker }),
				JSON.stringify({ event: {}, sourceId: 'remote-source', secret: secretPayloadMarker }),
				JSON.stringify({
					event: { kind: 'unknown_kind', uri: 'user://profile', secret: secretPayloadMarker },
					sourceId: 'remote-source',
				}),
				JSON.stringify({
					event: { kind: 7, uri: 'user://profile', secret: secretPayloadMarker },
					sourceId: 'remote-source',
				}),
				JSON.stringify({
					event: { kind: 'resource_updated', secret: secretPayloadMarker },
					sourceId: 'remote-source',
				}),
				JSON.stringify({
					event: { kind: 'resource_updated', uri: 7, secret: secretPayloadMarker },
					sourceId: 'remote-source',
				}),
			];

			for (const [index, message] of malformedMessages.entries()) {
				publish(message);
				expect(received).toEqual([]);
				assertSafeDiagnostics(errors, index + 1);
			}
		} finally {
			await unsubscribeAndSettle(unsubscribe, bus);
		}
	});
});
