import { describe, expect, it, mock } from 'bun:test';

mock.module('@web/env', () => ({
	environment: {
		MCP_ALLOWED_ORIGINS: 'http://localhost:3000',
		MCP_CONFORMANCE_MODE: false,
		MCP_ENABLE_ENTERPRISE_AUTH: false,
		MCP_ENABLE_UI_EXTENSION: true,
		MCP_ENABLE_CLIENT_CREDENTIALS: true,
		MCP_PROTOCOL_VERSION: '2025-11-25',
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
	enforceMcpRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0, remainingRequests: 10 }),
}));

mock.module('@web/lib/enterprise-authorization-policy', () => ({
	evaluateEnterpriseAuthorizationPolicy: async () => ({ allowed: true }),
}));

mock.module('@web/lib/mcp-origin-validation', () => ({
	validateMcpRequestOrigin: () => ({ allowed: true }),
	createMcpCorsHeaders: () => ({}),
}));

mock.module('@web/lib/mcp-protocol-constants', () => ({
	mcpProtocolVersion: '2025-11-25',
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

	it('delegates to MCP handler when token is valid', async () => {
		mockTokenResult = [
			{
				accessToken: 'hashed:valid-token',
				clientId: 'client-1',
				userId: 'user-1',
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
});
