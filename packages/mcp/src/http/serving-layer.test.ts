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

function listenContext(): OAuthRequestContext {
	const request = new Request(resource, {
		method: 'POST',
		headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'subscriptions/listen',
			params: { notifications: { resourceSubscriptions: ['res://x'] } },
		}),
	});
	return {
		request,
		requestUrl: new URL(resource),
		requestId: 'request-listen',
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
		markServerOnlyCloseableStream?: (response: Response) => Response;
		trustedProxy?: McpAuthenticationConfiguration['trustedProxy'];
		allowedOrigins?: ReadonlySet<string>;
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
			allowedOrigins: input.allowedOrigins ?? configuration.allowedOrigins,
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
		markServerOnlyCloseableStream: input.markServerOnlyCloseableStream,
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

	test('returns immutable-header responses with CORS and releases their concurrency slot', async () => {
		const state = harness({
			allowedOrigins: new Set(['https://client.example']),
			handle: async () => {
				const response = Response.redirect('https://client.example/complete');
				Object.defineProperty(response.headers, 'set', {
					value: () => {
						throw new TypeError('immutable headers');
					},
				});
				return response;
			},
		});
		const requestContext = context();
		requestContext.request = new Request(resource, {
			method: 'POST',
			headers: {
				authorization: 'Bearer valid',
				origin: 'https://client.example',
			},
		});
		const response = await state.layer.handle(requestContext);
		expect(response.status).toBe(302);
		expect(response.headers.get('access-control-allow-origin')).toBe('https://client.example');
		await response.text();
		await Promise.resolve();
		expect(state.releaseCount).toBe(1);
	});

	test('tags the final listen response via the serving-layer seam (TRI-128)', async () => {
		const tagged = new WeakSet<Response>();
		const listening = harness({
			markServerOnlyCloseableStream: (response) => {
				tagged.add(response);
				return response;
			},
			handle: async () =>
				new Response('event: connected\n\n', {
					headers: { 'content-type': 'text/event-stream' },
				}),
		});
		// The seam is applied to the exact response the layer returns — after the
		// CORS and concurrency re-wraps that replace the object the handler tagged.
		const response = await listening.layer.handle(listenContext());
		expect(tagged.has(response)).toBe(true);
	});

	test('releases the concurrency slot when the listen probe clone fails (TRI-128)', async () => {
		const releasing = harness({
			markServerOnlyCloseableStream: (response) => response,
		});
		const request = new Request(resource, {
			method: 'POST',
			headers: { authorization: 'Bearer valid' },
			body: 'locked',
		});
		// Lock the body so the serving layer probe clone() throws after the slot is
		// acquired; the slot must still be released rather than held until its TTL.
		request.body?.getReader();
		const lockedContext: OAuthRequestContext = {
			request,
			requestUrl: new URL(resource),
			requestId: 'request-locked',
			socketAddress: '203.0.113.1',
			identity: null,
		};
		await expect(releasing.layer.handle(lockedContext)).rejects.toThrow();
		expect(releasing.releaseCount).toBe(1);
	});

	test('resolves without hanging when the handler ignores the body on the probe path (TRI-128)', async () => {
		const releasing = harness({
			markServerOnlyCloseableStream: (response) => response,
			handle: async () => new Response('ok'),
		});
		const request = new Request(resource, {
			method: 'POST',
			headers: { authorization: 'Bearer valid' },
			body: 'unconsumed',
		});
		// The handler returns a non-stream response without reading the body, so the
		// probe tee's peer stays unread. Cancelling it must not be awaited, or this
		// never resolves.
		const unreadContext: OAuthRequestContext = {
			request,
			requestUrl: new URL(resource),
			requestId: 'request-noconsume',
			socketAddress: '203.0.113.1',
			identity: null,
		};
		const response = await releasing.layer.handle(unreadContext);
		expect(response.status).toBe(200);
		await response.text();
		expect(releasing.releaseCount).toBe(1);
	});

	test('does not tag a non-listen response (TRI-128)', async () => {
		const tagged = new WeakSet<Response>();
		const ordinary = harness({
			markServerOnlyCloseableStream: (response) => {
				tagged.add(response);
				return response;
			},
			handle: async () => new Response('ok'),
		});
		const response = await ordinary.layer.handle(context());
		expect(tagged.has(response)).toBe(false);
	});
});
