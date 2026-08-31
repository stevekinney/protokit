import { beforeEach, describe, expect, test } from 'bun:test';

import type { McpRegistry } from './scope-vocabulary.js';
import type { OAuthDiscoveryConfiguration, OAuthHostSeams } from './oauth/index.js';
import {
	createSvelteKitMcpMount,
	primeSvelteKitMcpIdentity,
	type SvelteKitLikeRequestEvent,
} from './sveltekit-mount.js';
import { resetSvelteKitMountStateForTesting } from './sveltekit-mount-state.js';

const registry = { tools: [], resources: [], prompts: [] } as unknown as McpRegistry<'read'>;
const oauthSeams = {} as OAuthHostSeams<'read'>;
const discoveryConfiguration = {} as OAuthDiscoveryConfiguration;

function event(path = '/mcp', address = '203.0.113.1'): SvelteKitLikeRequestEvent {
	const url = new URL(path, 'https://example.com');
	return {
		request: new Request(url),
		url,
		locals: {},
		getClientAddress: () => address,
	};
}

function harness(input: { start?: () => Promise<void>; longLivedProcess?: boolean } = {}) {
	const addresses: Array<string | undefined> = [];
	let shutdownCount = 0;
	return {
		addresses,
		get shutdownCount() {
			return shutdownCount;
		},
		mount: () =>
			createSvelteKitMcpMount({
				oauthSeams,
				discoveryConfiguration,
				registry,
				identityHandleName: 'identityHandle',
				longLivedProcess: input.longLivedProcess ?? true,
				mcp: {
					start: input.start ?? (async () => {}),
					shutdown: async () => {
						shutdownCount += 1;
					},
					publishGrantRevocation: async () => {},
					handle: async (context) => {
						addresses.push(context.socketAddress);
						return new Response('mcp');
					},
				},
			}),
	};
}

describe('createSvelteKitMcpMount', () => {
	beforeEach(resetSvelteKitMountStateForTesting);

	test('requires the named identity handle to prime every request', async () => {
		const state = harness();
		const mount = await state.mount();
		const requestEvent = event();
		await expect(
			mount.handle({ event: requestEvent, resolve: async () => new Response('host') }),
		).rejects.toThrow('identityHandle');
		primeSvelteKitMcpIdentity(requestEvent, null);
		expect(
			await (
				await mount.handle({ event: requestEvent, resolve: async () => new Response('host') })
			).text(),
		).toBe('mcp');
		await mount.dispose();
	});

	test('catches a conditionally skipped identity handle in a misordered chain', async () => {
		const state = harness();
		const mount = await state.mount();
		const identityHandle = async (requestEvent: SvelteKitLikeRequestEvent, enabled: boolean) => {
			if (enabled) primeSvelteKitMcpIdentity(requestEvent, null);
			return mount.handle({ event: requestEvent, resolve: async () => new Response('host') });
		};
		await expect(identityHandle(event(), false)).rejects.toThrow('identityHandle');
		await mount.dispose();
	});

	test('reads client addresses per request rather than collapsing them at construction', async () => {
		const state = harness();
		const mount = await state.mount();
		for (const address of ['203.0.113.1', '198.51.100.2']) {
			const requestEvent = event('/mcp', address);
			primeSvelteKitMcpIdentity(requestEvent, null);
			await mount.handle({ event: requestEvent, resolve: async () => new Response('host') });
		}
		expect(state.addresses).toEqual(['203.0.113.1', '198.51.100.2']);
		await mount.dispose();
	});

	test('claims one permanent process lifecycle synchronously', async () => {
		const state = harness();
		const first = state.mount();
		await expect(state.mount()).rejects.toThrow('already been constructed');
		const mount = await first;
		await mount.dispose();
		await mount.dispose();
		await expect(
			mount.handle({ event: event(), resolve: async () => new Response('host') }),
		).rejects.toThrow('disposed');
		await expect(state.mount()).rejects.toThrow('cannot be constructed again');
		expect(state.shutdownCount).toBe(1);
	});

	test('reports both startup and cleanup failures', async () => {
		const startupError = new Error('startup failed');
		const cleanupError = new Error('cleanup failed');
		await expect(
			createSvelteKitMcpMount({
				oauthSeams,
				discoveryConfiguration,
				registry,
				identityHandleName: 'identityHandle',
				longLivedProcess: true,
				mcp: {
					start: async () => {
						throw startupError;
					},
					shutdown: async () => {
						throw cleanupError;
					},
					publishGrantRevocation: async () => {},
					handle: async () => new Response('mcp'),
				},
			}),
		).rejects.toEqual(
			new AggregateError(
				[startupError, cleanupError],
				'The SvelteKit MCP mount failed to start and its cleanup also failed.',
				{ cause: cleanupError },
			),
		);
	});

	test('tears down failed startup and refuses same-process retry', async () => {
		const state = harness({
			start: async () => {
				throw new Error('startup failed');
			},
		});
		await expect(state.mount()).rejects.toThrow('startup failed');
		expect(state.shutdownCount).toBe(1);
		await expect(state.mount()).rejects.toThrow('cannot be constructed again');
	});

	test('fails loudly for a request-scoped runtime', async () => {
		const state = harness({ longLivedProcess: false });
		await expect(state.mount()).rejects.toThrow('long-lived process');
		expect(state.shutdownCount).toBe(1);
	});
});
