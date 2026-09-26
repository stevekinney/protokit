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
import { createInMemorySlidingWindowStore } from './rate-limit/index.js';
import { resetSvelteKitMountStateForTesting } from './sveltekit-mount-state.js';

const registry = {
	tools: [{ requiredScope: 'repositories:read' }],
	resources: [],
	prompts: [],
} as unknown as McpRegistry<'repositories:read'>;
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
const discoveryConfiguration = {
	issuer: configurationContractFixture.issuer,
	baseUrl: configurationContractFixture.baseUrl,
	resource: configurationContractFixture.resource,
	mcpUiExtension: configurationContractFixture.mcpUiExtension,
	serverName: 'mount-test',
	mcpProtocolVersion: '2026-07-28',
} satisfies OAuthDiscoveryConfiguration;

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
			'scopes.supportedScopes[0]',
			{ ...oauthSeams, scopes: { ...oauthSeams.scopes, supportedScopes: ['undeclared:scope'] } },
		],
		[
			'configuration.baseUrl',
			{ ...oauthSeams, configuration: { ...oauthSeams.configuration, baseUrl: undefined } },
		],
		[
			'configuration.issuer',
			{ ...oauthSeams, configuration: { ...oauthSeams.configuration, issuer: '' } },
		],
		[
			'configuration.trustedProxy.trustedProxyCidrs[0]',
			{
				...oauthSeams,
				configuration: {
					...oauthSeams.configuration,
					trustedProxy: {
						...oauthSeams.configuration.trustedProxy,
						trustedProxyCidrs: [null],
					},
				},
			},
		],
		[
			'configuration.trustedProxy.trustedProxyHeader',
			{
				...oauthSeams,
				configuration: {
					...oauthSeams.configuration,
					trustedProxy: {
						...oauthSeams.configuration.trustedProxy,
						trustedProxyHeader: 'x-forwarded',
					},
				},
			},
		],
		[
			'configuration.trustedProxy.trustedProxyHopCount',
			{
				...oauthSeams,
				configuration: {
					...oauthSeams.configuration,
					trustedProxy: {
						...oauthSeams.configuration.trustedProxy,
						trustedProxyHopCount: 0.5,
					},
				},
			},
		],
		['recordEvent', { ...oauthSeams, recordEvent: 'not-callable' }],
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
			'scopes.supportedScopes',
			{
				discoveryConfiguration,
				registry: {
					tools: [],
					resources: [],
					prompts: [],
				} as unknown as McpRegistry<'repositories:read'>,
			},
		],
		[
			'discoveryConfiguration.resource',
			{
				discoveryConfiguration: {
					...discoveryConfiguration,
					resource: new URL('https://application.example.com/different-mcp'),
				},
				registry,
			},
		],
		[
			'configuration.baseUrl',
			{
				oauthSeams: {
					...oauthSeams,
					configuration: {
						...oauthSeams.configuration,
						baseUrl: new URL('https://application.example.com/gateway'),
					},
				},
				discoveryConfiguration: {
					...discoveryConfiguration,
					baseUrl: new URL('https://application.example.com/gateway'),
				},
				registry,
			},
		],
	] as const)(
		'refuses to start when the mount configuration %s disagrees with the OAuth seams',
		async (expectedPath, mountConfiguration) => {
			let startCount = 0;
			await expect(
				createSvelteKitMcpMount({
					oauthSeams,
					...mountConfiguration,
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

	test('uses fly-client-ip for OAuth endpoint rate limiting while preserving raw socket peers', async () => {
		const state = harness();
		const mount = await createSvelteKitMcpMount({
			oauthSeams: {
				...oauthSeams,
				configuration: {
					...oauthSeams.configuration,
					trustedProxy: {
						...oauthSeams.configuration.trustedProxy,
						trustedProxyCidrs: ['10.0.0.0/8'],
						trustedProxyHeader: 'fly-client-ip',
					},
					rateLimits: {
						...oauthSeams.configuration.rateLimits,
						categories: {
							...oauthSeams.configuration.rateLimits.categories,
							oauth_register: { maximumRequests: 1, windowSeconds: 60 },
						},
					},
					rateLimitStores: {
						...oauthSeams.configuration.rateLimitStores,
						slidingWindow: createInMemorySlidingWindowStore(),
					},
				},
			},
			discoveryConfiguration,
			registry,
			identityHandleName: 'identityHandle',
			longLivedProcess: true,
			mcp: {
				start: async () => {},
				shutdown: async () => {},
				publishGrantRevocation: async () => {},
				handle: async (context) => {
					state.addresses.push(context.socketAddress);
					return new Response('mcp');
				},
			},
		});
		const firstRegistration = event('/oauth/register', '10.0.0.5');
		firstRegistration.request = new Request(firstRegistration.url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'fly-client-ip': '198.51.100.9' },
			body: JSON.stringify({
				client_name: 'First Client',
				redirect_uris: ['https://client.example.com/first'],
			}),
		});
		primeSvelteKitMcpIdentity(firstRegistration, null);
		const secondRegistration = event('/oauth/register', '10.0.0.6');
		secondRegistration.request = new Request(secondRegistration.url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'fly-client-ip': '198.51.100.9' },
			body: JSON.stringify({
				client_name: 'Second Client',
				redirect_uris: ['https://client.example.com/second'],
			}),
		});
		primeSvelteKitMcpIdentity(secondRegistration, null);
		const mcpEvent = event('/mcp', '10.0.0.7');
		mcpEvent.request = new Request(mcpEvent.url, {
			headers: { 'fly-client-ip': '198.51.100.9' },
		});
		primeSvelteKitMcpIdentity(mcpEvent, null);

		const firstResponse = await mount.handle({
			event: firstRegistration,
			resolve: async () => new Response('host'),
		});
		const secondResponse = await mount.handle({
			event: secondRegistration,
			resolve: async () => new Response('host'),
		});
		await mount.handle({ event: mcpEvent, resolve: async () => new Response('host') });

		expect(firstResponse.status).toBe(201);
		expect(secondResponse.status).toBe(429);
		expect(state.addresses).toEqual(['10.0.0.7']);
		await mount.dispose();
	});

	test('warns when OAuth rate-limit categories are configured without stores', async () => {
		const mountModuleUrl = new URL('./sveltekit-mount.ts', import.meta.url).href;
		const fixtureModuleUrl = new URL('./oauth/testing/contract-fixtures.ts', import.meta.url).href;
		const child = Bun.spawn({
			cmd: [
				process.execPath,
				'--no-env-file',
				'--eval',
				`
					if (process.env.NODE_ENV !== undefined) {
						throw new Error('NODE_ENV must be absent for this regression test');
					}
					if (process.env.MCP_SERVER_NAME !== undefined) {
						throw new Error('MCP_SERVER_NAME must be absent for this regression test');
					}
					const mountModule = await import(${JSON.stringify(mountModuleUrl)});
					const fixtures = await import(${JSON.stringify(fixtureModuleUrl)});
					const registry = {
						tools: [{ requiredScope: 'repositories:read' }],
						resources: [],
						prompts: [],
					};
					const oauthSeams = {
						fetchClientIdMetadataDocument: async () => null,
						resolveIdentityBinding: fixtures.identityContractFixture,
						resolveUserProfile: fixtures.userProfileContractFixture,
						handleUnauthenticatedAuthorization: fixtures.unauthenticatedAuthorizationContractFixture,
						renderConsent: fixtures.consentContractFixture,
						stores: fixtures.storeContractFixture,
						scopes: fixtures.scopeContractFixture,
						configuration: {
							...fixtures.configurationContractFixture,
							rateLimitStores: undefined,
						},
						hashCredential: (value) => value,
						crossInstanceMessaging: fixtures.crossInstanceMessagingContractFixture,
					};
					const mount = await mountModule.createSvelteKitMcpMount({
						oauthSeams,
						discoveryConfiguration: {
							issuer: fixtures.configurationContractFixture.issuer,
							baseUrl: fixtures.configurationContractFixture.baseUrl,
							resource: fixtures.configurationContractFixture.resource,
							mcpUiExtension: fixtures.configurationContractFixture.mcpUiExtension,
							serverName: 'mount-test',
							mcpProtocolVersion: '2026-07-28',
						},
						registry,
						identityHandleName: 'identityHandle',
						longLivedProcess: true,
						mcp: {
							start: async () => console.log('MOUNT_START_INVOKED'),
							shutdown: async () => {},
							publishGrantRevocation: async () => {},
							handle: async () => new Response('mcp'),
						},
					});
					await mount.dispose();
				`,
			],
			env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill();
		}, 5_000);
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		clearTimeout(timeout);
		const output = `${stdout}\n${stderr}`;

		expect({ exitCode, stdout, stderr, timedOut }).toMatchObject({ exitCode: 0, timedOut: false });
		expect(stdout).toContain('MOUNT_START_INVOKED');
		expect(output).toContain('sveltekit_mcp_mount');
		expect(output).toContain('oauth_rate_limits');
		expect(output).toContain(
			'OAuth rate limits are configured without rate-limit stores; OAuth endpoint rate limiting and failed-authentication lockout are disabled.',
		);
	});

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
