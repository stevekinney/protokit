import { describe, expect, test } from 'bun:test';

import type { OAuthRequestContext } from '../oauth/index.js';
import type { AccessToken, TokenStore } from '../oauth/stores.js';
import type { McpAuthenticationConfiguration } from './authenticate.js';
import { createMcpHttpServingLayer } from './serving-layer.js';

const resource = 'https://server.example/mcp';
const configuration: McpAuthenticationConfiguration = {
	resource: new URL(resource),
	protocolVersion: '2026-07-28',
	supportedScopes: ['profile:read'],
	allowedOrigins: new Set(),
	maximumBearerTokenLength: 64,
	maximumFailedAuthenticationAttempts: 3,
	dnsRebindingProtection: false,
	trustedProxy: {
		trustedProxyCidrs: [],
		trustedProxyHeader: undefined,
		trustedProxyHopCount: 0,
	},
};

const storedToken: AccessToken = {
	accessTokenHash: 'hashed:valid',
	clientId: 'client-1',
	userId: 'user-1',
	scope: 'profile:read',
	resource,
	expiresAt: new Date('2099-01-01'),
	revokedAt: null,
	createdAt: new Date('2026-01-01'),
};

function context(method = 'POST'): OAuthRequestContext {
	const request = new Request(resource, {
		method,
		headers: method === 'OPTIONS' ? undefined : { authorization: 'Bearer valid' },
	});
	return {
		request,
		requestUrl: new URL(resource),
		requestId: 'request-1',
		socketAddress: '203.0.113.1',
		identity: null,
	};
}

function harness(
	input: {
		networkAllowed?: boolean;
		userAllowed?: boolean;
		concurrencyAllowed?: boolean;
		handle?: () => Promise<Response>;
		trustedProxy?: McpAuthenticationConfiguration['trustedProxy'];
	} = {},
) {
	const operations: string[] = [];
	let releaseCount = 0;
	const rateLimiter = {
		peek: async (category: string) => {
			operations.push(`peek:${category}`);
			return 0;
		},
		consume: async (category: string, identifier: string) => {
			operations.push(`consume:${category}:${identifier}`);
			const allowed =
				category === 'mcp_network'
					? (input.networkAllowed ?? true)
					: category === 'mcp_user'
						? (input.userAllowed ?? true)
						: true;
			return { allowed, retryAfterSeconds: 7, remainingRequests: allowed ? 1 : 0 };
		},
	};
	const tokens = {
		findByHash: async () => {
			operations.push('token');
			return storedToken;
		},
	} as TokenStore;
	const layer = createMcpHttpServingLayer({
		authenticationConfiguration: {
			...configuration,
			trustedProxy: input.trustedProxy ?? configuration.trustedProxy,
		},
		authenticationSeams: {
			tokens,
			resolveUserProfile: async () => {
				operations.push('profile');
				return {
					id: 'user-1',
					email: 'user@example.com',
					name: 'User',
					image: null,
					role: 'user',
				};
			},
			hashCredential: (value) => `hashed:${value}`,
			rateLimiter,
			recordEvent: (outcome) => operations.push(`event:${outcome}`),
		},
		rateLimiter,
		concurrencyLimiter: {
			acquire: async () => {
				operations.push('concurrency');
				return {
					allowed: input.concurrencyAllowed ?? true,
					renewalIntervalMilliseconds: 60_000,
					renew: async () => {},
					release: async () => {
						releaseCount += 1;
					},
				};
			},
		},
		handler: {
			handle: async () => {
				operations.push('handler');
				return input.handle ? input.handle() : new Response('ok');
			},
		},
	});
	return {
		layer,
		operations,
		get releaseCount() {
			return releaseCount;
		},
	};
}

describe('MCP HTTP serving order', () => {
	test('applies network admission before authentication and skips it for OPTIONS', async () => {
		const denied = harness({ networkAllowed: false });
		expect((await denied.layer.handle(context())).status).toBe(429);
		expect(denied.operations).toEqual(['consume:mcp_network:203.0.113.1']);

		const preflight = harness({ networkAllowed: false });
		expect((await preflight.layer.handle(context('OPTIONS'))).status).toBe(204);
		expect(preflight.operations).toEqual([]);
	});

	test('orders authentication, per-user admission, concurrency, and handler dispatch', async () => {
		const state = harness();
		const response = await state.layer.handle(context());
		expect(await response.text()).toBe('ok');
		expect(state.operations).toEqual([
			'consume:mcp_network:203.0.113.1',
			'peek:failed_authentication',
			'token',
			'profile',
			'event:success',
			'consume:mcp_user:user-1',
			'concurrency',
			'handler',
		]);
	});

	test('uses the trusted forwarded peer for network admission and authentication lockout', async () => {
		const state = harness({
			trustedProxy: {
				trustedProxyCidrs: ['10.0.0.0/8'],
				trustedProxyHeader: 'x-forwarded-for',
				trustedProxyHopCount: 1,
			},
		});
		const requestContext = context();
		requestContext.socketAddress = '10.0.0.8';
		requestContext.request = new Request(resource, {
			method: 'POST',
			headers: {
				authorization: 'Bearer valid',
				'x-forwarded-for': '198.51.100.27',
			},
		});
		await state.layer.handle(requestContext);
		expect(state.operations[0]).toBe('consume:mcp_network:198.51.100.27');
	});

	test('short-circuits user admission and concurrency before later work', async () => {
		const userDenied = harness({ userAllowed: false });
		expect((await userDenied.layer.handle(context())).status).toBe(429);
		expect(userDenied.operations).not.toContain('concurrency');
		expect(userDenied.operations).not.toContain('handler');

		const concurrencyDenied = harness({ concurrencyAllowed: false });
		expect((await concurrencyDenied.layer.handle(context())).status).toBe(429);
		expect(concurrencyDenied.operations).toContain('concurrency');
		expect(concurrencyDenied.operations).not.toContain('handler');
	});

	test('holds the concurrency slot until a streaming response body closes', async () => {
		let closeStream: (() => void) | undefined;
		const state = harness({
			handle: async () =>
				new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(new TextEncoder().encode('event'));
							closeStream = () => controller.close();
						},
					}),
				),
		});
		const response = await state.layer.handle(context());
		expect(state.releaseCount).toBe(0);
		const reading = response.text();
		await Promise.resolve();
		expect(state.releaseCount).toBe(0);
		closeStream?.();
		expect(await reading).toBe('event');
		await Promise.resolve();
		expect(state.releaseCount).toBe(1);
	});

	test('releases directly when dispatch throws before producing a response', async () => {
		const state = harness({
			handle: async () => {
				throw new Error('dispatch failed');
			},
		});
		await expect(state.layer.handle(context())).rejects.toThrow('dispatch failed');
		expect(state.releaseCount).toBe(1);
	});
});
