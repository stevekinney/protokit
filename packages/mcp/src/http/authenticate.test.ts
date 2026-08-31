import { describe, expect, test } from 'bun:test';

import type { OAuthRequestContext } from '../oauth/index.js';
import type { AccessToken, TokenStore } from '../oauth/stores.js';
import { authenticateMcpUser, type McpAuthenticationConfiguration } from './authenticate.js';

const resource = 'https://server.example/mcp';
const profile = {
	id: 'user-1',
	email: 'user@example.com',
	name: 'User',
	image: null,
	role: 'user',
};

function token(overrides: Partial<AccessToken> = {}): AccessToken {
	return {
		accessTokenHash: 'hashed:valid',
		clientId: 'client-1',
		userId: 'user-1',
		scope: 'profile:read',
		resource,
		expiresAt: new Date('2099-01-01'),
		revokedAt: null,
		createdAt: new Date('2026-01-01'),
		...overrides,
	};
}

function requestContext(
	input: {
		url?: string;
		method?: string;
		headers?: Record<string, string>;
	} = {},
): OAuthRequestContext {
	const request = new Request(input.url ?? resource, {
		method: input.method ?? 'POST',
		headers: input.headers,
	});
	return {
		request,
		requestUrl: new URL(request.url),
		requestId: 'request-1',
		socketAddress: '203.0.113.1',
		identity: null,
	};
}

const configuration: McpAuthenticationConfiguration = {
	resource: new URL(resource),
	protocolVersion: '2026-07-28',
	supportedScopes: ['profile:read'],
	allowedOrigins: new Set(['https://client.example']),
	maximumBearerTokenLength: 64,
	maximumFailedAuthenticationAttempts: 3,
	dnsRebindingProtection: true,
};

function harness(input: { storedToken?: AccessToken | null; failedCount?: number } = {}) {
	let tokenLookups = 0;
	const events: string[] = [];
	const rateLimitOperations: string[] = [];
	const tokens = {
		findByHash: async () => {
			tokenLookups += 1;
			return input.storedToken === undefined ? token() : input.storedToken;
		},
	} as TokenStore;
	return {
		seams: {
			tokens,
			resolveUserProfile: async () => profile,
			hashCredential: (value: string) => `hashed:${value}`,
			rateLimiter: {
				peek: async (category: string) => {
					rateLimitOperations.push(`peek:${category}`);
					return input.failedCount ?? 0;
				},
				consume: async (category: string) => {
					rateLimitOperations.push(`consume:${category}`);
					return { allowed: true, retryAfterSeconds: 0, remainingRequests: 1 };
				},
			},
			recordEvent: (outcome: string) => events.push(outcome),
		},
		get tokenLookups() {
			return tokenLookups;
		},
		events,
		rateLimitOperations,
	};
}

describe('authenticateMcpUser ordering', () => {
	test('rejects localhost rebinding before origin validation', async () => {
		const state = harness({ failedCount: 99 });
		const response = await authenticateMcpUser({
			context: requestContext({
				url: 'http://localhost/mcp',
				headers: { host: 'localhost', origin: 'https://attacker.example' },
			}),
			configuration,
			seams: state.seams,
		});
		expect(response).toBeInstanceOf(Response);
		expect(await (response as Response).text()).toContain('localhost DNS rebinding');
		expect(state.rateLimitOperations).toEqual([]);
	});

	test('rejects a disallowed Origin before lockout and accepts an omitted Origin', async () => {
		const rejected = harness({ failedCount: 99 });
		const response = await authenticateMcpUser({
			context: requestContext({ headers: { origin: 'https://attacker.example' } }),
			configuration,
			seams: rejected.seams,
		});
		expect((response as Response).status).toBe(403);
		expect(rejected.rateLimitOperations).toEqual([]);

		const accepted = harness();
		const authInfo = await authenticateMcpUser({
			context: requestContext({ headers: { authorization: 'Bearer valid' } }),
			configuration,
			seams: accepted.seams,
		});
		expect(authInfo).not.toBeInstanceOf(Response);
	});

	test('answers OPTIONS before lockout', async () => {
		const state = harness({ failedCount: 99 });
		const response = await authenticateMcpUser({
			context: requestContext({ method: 'OPTIONS' }),
			configuration,
			seams: state.seams,
		});
		expect((response as Response).status).toBe(204);
		expect(state.rateLimitOperations).toEqual([]);
	});

	test('enforces lockout before reading the bearer credential', async () => {
		const state = harness({ failedCount: 3 });
		const response = await authenticateMcpUser({
			context: requestContext(),
			configuration,
			seams: state.seams,
		});
		expect((response as Response).status).toBe(429);
		expect(state.tokenLookups).toBe(0);
	});

	test('checks the bearer scheme before token bounds and lookup', async () => {
		const state = harness();
		const response = await authenticateMcpUser({
			context: requestContext({ headers: { authorization: 'Basic value' } }),
			configuration,
			seams: state.seams,
		});
		expect((response as Response).status).toBe(401);
		expect(await (response as Response).text()).toContain('Missing or invalid Authorization');
		expect(state.tokenLookups).toBe(0);
	});

	test('checks bearer bounds before token lookup', async () => {
		const state = harness();
		const response = await authenticateMcpUser({
			context: requestContext({ headers: { authorization: `Bearer ${'x'.repeat(65)}` } }),
			configuration,
			seams: state.seams,
		});
		expect(await (response as Response).text()).toContain('Malformed bearer token');
		expect(state.tokenLookups).toBe(0);
	});

	test('checks resource audience after lookup and collapses it with token-not-found on the wire', async () => {
		const missing = harness({ storedToken: null });
		const wrongResource = harness({
			storedToken: token({ resource: 'https://other.example/mcp' }),
		});
		const context = requestContext({ headers: { authorization: 'Bearer valid' } });
		const missingResponse = (await authenticateMcpUser({
			context,
			configuration,
			seams: missing.seams,
		})) as Response;
		const wrongResourceResponse = (await authenticateMcpUser({
			context,
			configuration,
			seams: wrongResource.seams,
		})) as Response;
		expect(wrongResourceResponse.status).toBe(missingResponse.status);
		expect([...wrongResourceResponse.headers]).toEqual([...missingResponse.headers]);
		expect(await wrongResourceResponse.text()).toBe(await missingResponse.text());
		expect(missing.events).toEqual(['expired_or_invalid_token']);
		expect(wrongResource.events).toEqual(['invalid_resource']);
	});
});
