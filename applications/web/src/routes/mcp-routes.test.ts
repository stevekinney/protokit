import { describe, expect, it, mock } from 'bun:test';

mock.module('@web/env', () => ({
	environment: {
		MCP_ALLOWED_ORIGINS: 'http://localhost:3000',
		MCP_CONFORMANCE_MODE: false,
		MCP_ENABLE_UI_EXTENSION: true,
		BASE_URL: undefined,
	},
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: (n: number) => {
						void n;
						return Promise.resolve(mockTokenResult);
					},
				}),
			}),
		}),
	},
	schema: {
		oauthTokens: {
			accessToken: 'accessToken',
			revokedAt: 'revokedAt',
			expiresAt: 'expiresAt',
		},
	},
}));

mock.module('drizzle-orm', () => ({
	and: (...args: unknown[]) => args,
	eq: (column: unknown, value: unknown) => ({ column, value }),
	gt: (column: unknown, value: unknown) => ({ column, value }),
	isNull: (column: unknown) => ({ column }),
}));

mock.module('@web/lib/hash-credential', () => ({
	hashCredential: (value: string) => `hashed:${value}`,
}));

mock.module('@web/lib/mcp-handler', () => ({
	handleMcpRequest: async () => new Response('{"ok":true}', { status: 200 }),
}));

mock.module('@web/lib/request-rate-limiter', () => ({
	enforceMcpNetworkRateLimit: async () => ({
		allowed: true,
		retryAfterSeconds: 0,
		remainingRequests: 10,
	}),
	enforceMcpRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0, remainingRequests: 10 }),
	isAuthenticationLockedOut: async () => false,
	recordFailedAuthentication: async () => {},
}));

mock.module('@web/lib/mcp-concurrency-limiter', () => ({
	acquireMcpConcurrencySlot: async () => ({ allowed: true, release: async () => {} }),
}));

mock.module('@web/lib/mcp-origin-validation', () => ({
	validateMcpRequestOrigin: () => ({ allowed: true }),
	createMcpCorsHeaders: () => ({}),
}));

mock.module('@web/lib/mcp-protocol-constants', () => ({
	mcpLatestProtocolVersion: '2026-07-28',
}));

mock.module('@web/lib/base-url', () => ({
	getBaseUrl: () => 'http://localhost:3000',
}));

mock.module('@template/mcp', () => ({
	isLoopbackHostname: () => false,
	hasValidLocalhostRebindingHeaders: () => true,
}));

let mockTokenResult: unknown[] = [];

const { handleMcpRequestWithAuthentication } = await import('@web/routes/mcp-routes');

function createContext(
	overrides: Partial<{
		url: string;
		method: string;
		headers: Record<string, string>;
	}> = {},
) {
	const url = overrides.url ?? 'http://localhost:3000/mcp';
	const request = new Request(url, {
		method: overrides.method ?? 'POST',
		headers: overrides.headers ?? {},
	});
	return {
		request,
		requestUrl: new URL(url),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: null,
		sessionToken: null,
	};
}

describe('handleMcpRequestWithAuthentication', () => {
	it('returns 401 when authorization header is missing', async () => {
		const context = createContext();
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(401);
	});

	it('returns 401 when authorization header is not Bearer', async () => {
		const context = createContext({
			headers: { authorization: 'Basic dXNlcjpwYXNz' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(401);
	});

	it('returns 401 when token is invalid', async () => {
		mockTokenResult = [];
		const context = createContext({
			headers: { authorization: 'Bearer invalid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(401);
	});

	it('returns 401 for a bearer token over the maximum length', async () => {
		mockTokenResult = [];
		const context = createContext({
			headers: { authorization: `Bearer ${'a'.repeat(1000)}` },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(401);
	});

	it('delegates to MCP handler when token is valid', async () => {
		mockTokenResult = [
			{
				accessToken: 'hashed:valid-token',
				clientId: 'client-1',
				userId: 'user-1',
				scope: 'mcp:read',
				resource: 'http://localhost:3000/mcp',
				revokedAt: null,
				expiresAt: new Date(Date.now() + 60000),
			},
		];
		const context = createContext({
			headers: { authorization: 'Bearer valid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(200);
	});

	it('returns 401 when the token was issued for a different resource', async () => {
		mockTokenResult = [
			{
				accessToken: 'hashed:valid-token',
				clientId: 'client-1',
				userId: 'user-1',
				scope: 'mcp:read',
				resource: 'http://attacker.example.com/mcp',
				revokedAt: null,
				expiresAt: new Date(Date.now() + 60000),
			},
		];
		const context = createContext({
			headers: { authorization: 'Bearer valid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(401);
		expect(response.headers.get('www-authenticate')).toContain('error="invalid_token"');
	});
});
