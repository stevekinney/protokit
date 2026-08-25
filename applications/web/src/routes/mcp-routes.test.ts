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

const hashCredentialCalls: string[] = [];
mock.module('@web/lib/hash-credential', () => ({
	hashCredential: (value: string) => {
		hashCredentialCalls.push(value);
		return `hashed:${value}`;
	},
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
	acquireMcpConcurrencySlot: async () => ({
		allowed: true,
		release: async () => {},
		renew: async () => {},
	}),
	attachConcurrencySlotToResponseLifetime: (response: Response) => response,
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
	// AUTHZ-001: real value, not a stub — this is the same production-derived
	// scope list `oauth-routes.ts`'s metadata endpoints publish, and this
	// suite's `WWW-Authenticate` assertions check against it by name.
	getSupportedScopes: () => ['profile:read', 'prompts:read'],
}));

let mockTokenResult: unknown[] = [];

const { handleMcpRequestWithAuthentication, isDnsRebindingProtectionActive } =
	await import('@web/routes/mcp-routes');

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

	// Round 10 review (P2, sibling of `bearer-credential-authentication.ts`'s
	// case-insensitive-scheme fix): RFC 7235 §2.1 makes the HTTP auth scheme
	// name case-insensitive -- a standards-compliant client sending `bearer`
	// (lowercase) must still authenticate.
	it('delegates to MCP handler when the Authorization scheme is lowercase ("bearer")', async () => {
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
			headers: { authorization: 'bearer valid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(200);
	});

	// Round 17 review (P2): RFC 7235 §2.1 permits one or more spaces between
	// the auth-scheme and the credentials (`1*SP`), not exactly one. A
	// compliant client sending `Authorization: Bearer   <token>` (multiple
	// spaces) must still authenticate -- the extra spaces must never become
	// part of the hashed token.
	it('delegates to MCP handler when multiple spaces separate the scheme and the token', async () => {
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
		hashCredentialCalls.length = 0;
		const context = createContext({
			headers: { authorization: 'Bearer   valid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(200);
		// The mocked database query ignores its filter arguments and always
		// resolves `mockTokenResult`, so a passing `response.status` alone
		// would not prove the token was parsed correctly. Assert directly on
		// what was hashed: it must be exactly "valid-token", with no leading
		// whitespace retained from the multi-space separator.
		expect(hashCredentialCalls).toEqual(['valid-token']);
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

	// AUTHZ-001: the challenge previously carried no `scope` attribute at all
	// (there was no scope concept yet to back one). Every 401 challenge this
	// endpoint returns now names the actual supported scope set.
	it('carries a scope attribute naming the supported scopes on every 401 challenge', async () => {
		const context = createContext();
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(401);
		expect(response.headers.get('www-authenticate')).toContain('scope="profile:read prompts:read"');
	});
});

describe('isDnsRebindingProtectionActive (SEC-002)', () => {
	it('is active by default (not conformance mode, no tunnel)', () => {
		expect(
			isDnsRebindingProtectionActive({ conformanceModeConfigured: false, tunnelActive: false }),
		).toBe(true);
	});

	it('is inactive while conformance mode is configured', () => {
		expect(
			isDnsRebindingProtectionActive({ conformanceModeConfigured: true, tunnelActive: false }),
		).toBe(false);
	});

	it('is inactive while a tunnel is active', () => {
		expect(
			isDnsRebindingProtectionActive({ conformanceModeConfigured: false, tunnelActive: true }),
		).toBe(false);
	});

	it('is inactive when both conformance mode and a tunnel are active', () => {
		expect(
			isDnsRebindingProtectionActive({ conformanceModeConfigured: true, tunnelActive: true }),
		).toBe(false);
	});
});
