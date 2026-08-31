import { beforeEach, describe, expect, test } from 'bun:test';

import type { McpRegistry } from './scope-vocabulary.js';
import type { OAuthDiscoveryConfiguration, OAuthHostSeams } from './oauth/index.js';
import {
	configurationContractFixture,
	consentContractFixture,
	crossInstanceMessagingContractFixture,
	identityContractFixture,
	scopeContractFixture,
	storeContractFixture,
	unauthenticatedAuthorizationContractFixture,
	userProfileContractFixture,
} from './oauth/testing/contract-fixtures.js';
import {
	createSvelteKitMcpMount,
	primeSvelteKitMcpIdentity,
	type SvelteKitLikeRequestEvent,
} from './sveltekit-mount.js';
import { resetSvelteKitMountStateForTesting } from './sveltekit-mount-state.js';

const registry = { tools: [], resources: [], prompts: [] } as unknown as McpRegistry<'read'>;
const oauthSeams = {
	fetchClientIdMetadataDocument: async () => null,
	resolveIdentityBinding: identityContractFixture,
	resolveUserProfile: userProfileContractFixture,
	handleUnauthenticatedAuthorization: unauthenticatedAuthorizationContractFixture,
	renderConsent: consentContractFixture,
	stores: storeContractFixture,
	scopes: scopeContractFixture,
	configuration: configurationContractFixture,
	hashCredential: (value: string) => value,
	crossInstanceMessaging: crossInstanceMessagingContractFixture,
} satisfies OAuthHostSeams<'repositories:read'>;
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

	test('refuses to start when a required OAuth host seam is absent at runtime', async () => {
		const incompleteOauthSeams = { ...oauthSeams } as Partial<typeof oauthSeams>;
		delete incompleteOauthSeams.renderConsent;
		let startCount = 0;
		await expect(
			createSvelteKitMcpMount({
				oauthSeams: incompleteOauthSeams as OAuthHostSeams<'repositories:read'>,
				discoveryConfiguration,
				registry: registry as unknown as McpRegistry<'repositories:read'>,
				identityHandleName: 'identityHandle',
				longLivedProcess: true,
				mcp: {
					start: async () => {
						startCount += 1;
					},
					shutdown: async () => {},
					publishGrantRevocation: async () => {},
					handle: async () => new Response('mcp'),
				},
			}),
		).rejects.toThrow('renderConsent');
		expect(startCount).toBe(0);
	});

	test.each([
		['stores.clients', { ...oauthSeams, stores: { ...oauthSeams.stores, clients: undefined } }],
		['scopes.vocabulary', { ...oauthSeams, scopes: {} }],
		[
			'configuration.baseUrl',
			{ ...oauthSeams, configuration: { ...oauthSeams.configuration, baseUrl: undefined } },
		],
	] as const)(
		'refuses to start when the nested OAuth host seam %s is absent at runtime',
		async (expectedPath, incompleteOauthSeams) => {
			let startCount = 0;
			await expect(
				createSvelteKitMcpMount({
					oauthSeams: incompleteOauthSeams as unknown as OAuthHostSeams<'repositories:read'>,
					discoveryConfiguration,
					registry: registry as unknown as McpRegistry<'repositories:read'>,
					identityHandleName: 'identityHandle',
					longLivedProcess: true,
					mcp: {
						start: async () => {
							startCount += 1;
						},
						shutdown: async () => {},
						publishGrantRevocation: async () => {},
						handle: async () => new Response('mcp'),
					},
				}),
			).rejects.toThrow(expectedPath);
			expect(startCount).toBe(0);
		},
	);

	test.each([
		[
			'configuration.rateLimits.categories.oauth_authorize',
			{
				...configurationContractFixture,
				rateLimits: { ...configurationContractFixture.rateLimits, categories: {} },
			},
		],
		[
			'configuration.rateLimits.categories.oauth_authorize.maximumRequests',
			{
				...configurationContractFixture,
				rateLimits: {
					...configurationContractFixture.rateLimits,
					categories: {
						...configurationContractFixture.rateLimits.categories,
						oauth_authorize: {
							...configurationContractFixture.rateLimits.categories.oauth_authorize,
							maximumRequests: undefined,
						},
					},
				},
			},
		],
	] as const)(
		'refuses to start when the rate-limit configuration seam %s is malformed',
		async (expectedPath, configuration) => {
			let startCount = 0;
			await expect(
				createSvelteKitMcpMount({
					oauthSeams: {
						...oauthSeams,
						configuration,
					} as unknown as OAuthHostSeams<'repositories:read'>,
					discoveryConfiguration,
					registry: registry as unknown as McpRegistry<'repositories:read'>,
					identityHandleName: 'identityHandle',
					longLivedProcess: true,
					mcp: {
						start: async () => {
							startCount += 1;
						},
						shutdown: async () => {},
						publishGrantRevocation: async () => {},
						handle: async () => new Response('mcp'),
					},
				}),
			).rejects.toThrow(expectedPath);
			expect(startCount).toBe(0);
		},
	);

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
