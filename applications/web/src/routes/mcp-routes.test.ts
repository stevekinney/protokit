import { afterEach, describe, expect, it, mock } from 'bun:test';

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
				innerJoin: () => ({
					where: () => ({
						limit: (n: number) => {
							void n;
							return Promise.resolve(mockTokenResult);
						},
					}),
				}),
			}),
		}),
	},
	schema: {
		oauthTokens: {
			accessToken: 'accessToken',
			revokedAt: 'revokedAt',
			expiresAt: 'expiresAt',
			userId: 'userId',
		},
		users: {
			id: 'id',
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

let handleMcpRequestBehavior: 'success' | 'throw' = 'success';
mock.module('@web/lib/mcp-handler', () => ({
	handleMcpRequest: async () => {
		if (handleMcpRequestBehavior === 'throw') {
			throw new Error('handleMcpRequest exploded');
		}
		return new Response('{"ok":true}', { status: 200 });
	},
}));

let authenticationLockedOut = false;
let networkRateLimitAllowed = true;
let networkRateLimitRetryAfterSeconds = 0;
let userRateLimitAllowed = true;
let userRateLimitRetryAfterSeconds = 0;
mock.module('@web/lib/request-rate-limiter', () => ({
	enforceMcpNetworkRateLimit: async () => ({
		allowed: networkRateLimitAllowed,
		retryAfterSeconds: networkRateLimitRetryAfterSeconds,
		remainingRequests: networkRateLimitAllowed ? 10 : 0,
	}),
	enforceMcpRateLimit: async () => ({
		allowed: userRateLimitAllowed,
		retryAfterSeconds: userRateLimitRetryAfterSeconds,
		remainingRequests: userRateLimitAllowed ? 10 : 0,
	}),
	isAuthenticationLockedOut: async () => authenticationLockedOut,
	recordFailedAuthentication: async () => {},
}));

let concurrencySlotAllowed = true;
let concurrencySlotReleaseCalls = 0;
mock.module('@web/lib/mcp-concurrency-limiter', () => ({
	acquireMcpConcurrencySlot: async () => ({
		allowed: concurrencySlotAllowed,
		release: async () => {
			concurrencySlotReleaseCalls += 1;
		},
		renew: async () => {},
	}),
	attachConcurrencySlotToResponseLifetime: (response: Response) => response,
}));

mock.module('@web/lib/mcp-origin-validation', () => ({
	validateMcpRequestOrigin: () => ({ allowed: true }),
	// A non-empty CORS header set here, rather than `{}`, is load-bearing: it
	// exercises the header-merge loop in `handleMcpRequestWithAuthentication`
	// that copies `mcpCorsHeaders` onto the successful `handleMcpRequest`
	// response, and the "delegates to MCP handler when token is valid" test
	// asserts the header actually lands on the response rather than merely
	// executing the loop.
	createMcpCorsHeaders: () => ({ 'access-control-allow-origin': 'http://localhost:3000' }),
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

const validTokenResult = {
	accessToken: 'hashed:valid-token',
	clientId: 'client-1',
	userId: 'user-1',
	scope: 'mcp:read',
	resource: 'http://localhost:3000/mcp',
	expiresAt: new Date(Date.now() + 60000),
	userEmail: 'user-1@example.com',
	userName: 'Test User',
	userImage: null,
	userRole: 'user',
};

afterEach(() => {
	handleMcpRequestBehavior = 'success';
	authenticationLockedOut = false;
	networkRateLimitAllowed = true;
	networkRateLimitRetryAfterSeconds = 0;
	userRateLimitAllowed = true;
	userRateLimitRetryAfterSeconds = 0;
	concurrencySlotAllowed = true;
	concurrencySlotReleaseCalls = 0;
	mockTokenResult = [];
});

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
				expiresAt: new Date(Date.now() + 60000),
				userEmail: 'user-1@example.com',
				userName: 'Test User',
				userImage: null,
				userRole: 'user',
			},
		];
		const context = createContext({
			headers: { authorization: 'Bearer valid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(200);
		// The CORS headers computed for this request must actually be copied
		// onto the handler's response, not just computed and discarded.
		expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
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
				expiresAt: new Date(Date.now() + 60000),
				userEmail: 'user-1@example.com',
				userName: 'Test User',
				userImage: null,
				userRole: 'user',
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
				expiresAt: new Date(Date.now() + 60000),
				userEmail: 'user-1@example.com',
				userName: 'Test User',
				userImage: null,
				userRole: 'user',
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
				expiresAt: new Date(Date.now() + 60000),
				userEmail: 'user-1@example.com',
				userName: 'Test User',
				userImage: null,
				userRole: 'user',
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

	it('answers an OPTIONS preflight with 204 and no authentication required', async () => {
		// No authorization header at all -- if OPTIONS fell through to the
		// authentication checks below it, this would 401 instead.
		const context = createContext({ method: 'OPTIONS' });
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(204);
		expect(await response.text()).toBe('');
		expect(response.headers.get('mcp-protocol-version')).toBe('2026-07-28');
	});

	it('returns 429 when authentication is locked out, without ever reaching the token lookup', async () => {
		authenticationLockedOut = true;
		mockTokenResult = [validTokenResult];
		const context = createContext({
			headers: { authorization: 'Bearer valid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(429);
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe('rate_limited');
	});

	it('returns 429 with Retry-After when the network rate limit rejects the request', async () => {
		networkRateLimitAllowed = false;
		networkRateLimitRetryAfterSeconds = 42;
		const context = createContext({
			headers: { authorization: 'Bearer valid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('42');
	});

	it('never applies the network rate limit to an OPTIONS preflight', async () => {
		networkRateLimitAllowed = false;
		const context = createContext({ method: 'OPTIONS' });
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(204);
	});

	it('returns 401 when the authenticated auth context is missing required fields', async () => {
		// A token row whose userId is not a string fails
		// `readMcpRequestAuthExtra`'s shape check, producing an authenticated
		// `AuthInfo` with no usable `extra` -- distinct from "token not found"
		// (already covered above), this is the defense-in-depth branch for a
		// row that passed the DB query but doesn't shape-check afterward.
		mockTokenResult = [{ ...validTokenResult, userId: null }];
		const context = createContext({
			headers: { authorization: 'Bearer valid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(401);
	});

	it('returns 429 with Retry-After when the per-user rate limit rejects the request', async () => {
		mockTokenResult = [validTokenResult];
		userRateLimitAllowed = false;
		userRateLimitRetryAfterSeconds = 7;
		const context = createContext({
			headers: { authorization: 'Bearer valid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('7');
	});

	it('returns 429 when no concurrency slot is available for this user', async () => {
		mockTokenResult = [validTokenResult];
		concurrencySlotAllowed = false;
		const context = createContext({
			headers: { authorization: 'Bearer valid-token' },
		});
		const response = await handleMcpRequestWithAuthentication(context);
		expect(response.status).toBe(429);
		const body = (await response.json()) as { error: string; error_description: string };
		expect(body.error).toBe('rate_limited');
		expect(body.error_description).toContain('concurrent');
	});

	// The comment above the `catch` in `handleMcpRequestWithAuthentication`
	// explains why: the happy path defers slot release to the response
	// body's own lifetime, so this catch is the only path left to release a
	// slot when `handleMcpRequest` never produces a `Response` at all. A
	// test that only checks the resulting status would not catch a
	// regression that deleted the release call entirely -- assert on the
	// actual side effect (the mocked `release()` having run), not just the
	// propagated error.
	it('releases the concurrency slot when handleMcpRequest throws, rather than leaking it', async () => {
		mockTokenResult = [validTokenResult];
		handleMcpRequestBehavior = 'throw';
		const context = createContext({
			headers: { authorization: 'Bearer valid-token' },
		});

		expect(concurrencySlotReleaseCalls).toBe(0);
		await expect(handleMcpRequestWithAuthentication(context)).rejects.toThrow(
			'handleMcpRequest exploded',
		);
		expect(concurrencySlotReleaseCalls).toBe(1);
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
