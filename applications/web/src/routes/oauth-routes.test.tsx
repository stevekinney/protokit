import { describe, expect, it, mock, beforeEach } from 'bun:test';

const mockEnvironment: Record<string, unknown> = {};
let mockOauthClients: unknown[] = [];
const mockOauthCodes: unknown[] = [];
let mockOauthTokens: unknown[] = [];
let mockOauthRefreshTokens: unknown[] = [];
let mockInsertedValues: unknown[] = [];

const oauthClientsTable = Symbol('oauthClients');
const oauthCodesTable = Symbol('oauthCodes');
const oauthTokensTable = Symbol('oauthTokens');

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: (table: unknown) => ({
				where: () => ({
					limit: () => {
						if (table === oauthClientsTable) return Promise.resolve(mockOauthClients);
						if (table === oauthCodesTable) return Promise.resolve(mockOauthCodes);
						if (table === oauthTokensTable) return Promise.resolve(mockOauthTokens);
						return Promise.resolve([]);
					},
				}),
			}),
		}),
		insert: () => ({
			values: async (values: unknown) => {
				mockInsertedValues.push(values);
			},
		}),
		update: () => ({
			set: () => ({
				where: () => ({
					returning: () => Promise.resolve(mockOauthRefreshTokens),
				}),
			}),
		}),
	},
	schema: {
		oauthClients: oauthClientsTable,
		oauthCodes: oauthCodesTable,
		oauthTokens: oauthTokensTable,
		oauthRefreshTokens: {
			refreshToken: 'refreshToken',
			revokedAt: 'revokedAt',
			expiresAt: 'expiresAt',
		},
		users: { id: 'id', email: 'email' },
	},
}));

mock.module('drizzle-orm', () => ({
	and: (...args: unknown[]) => args,
	eq: (column: unknown, value: unknown) => ({ column, value }),
	gt: (column: unknown, value: unknown) => ({ column, value }),
	isNull: (column: unknown) => ({ column }),
}));

const mockRateLimitState = {
	registrationAllowed: true,
	tokenNetworkAllowed: true,
	tokenClientAllowed: true,
	revokeAllowed: true,
	authorizeAllowed: true,
};

mock.module('@web/lib/request-rate-limiter', () => ({
	enforceOauthRegistrationRateLimit: async () => ({
		allowed: mockRateLimitState.registrationAllowed,
		retryAfterSeconds: mockRateLimitState.registrationAllowed ? 0 : 30,
		remainingRequests: 10,
	}),
	enforceOauthTokenNetworkRateLimit: async () => ({
		allowed: mockRateLimitState.tokenNetworkAllowed,
		retryAfterSeconds: mockRateLimitState.tokenNetworkAllowed ? 0 : 30,
		remainingRequests: 10,
	}),
	enforceOauthTokenClientRateLimit: async () => ({
		allowed: mockRateLimitState.tokenClientAllowed,
		retryAfterSeconds: mockRateLimitState.tokenClientAllowed ? 0 : 30,
		remainingRequests: 10,
	}),
	enforceOauthRevokeRateLimit: async () => ({
		allowed: mockRateLimitState.revokeAllowed,
		retryAfterSeconds: mockRateLimitState.revokeAllowed ? 0 : 30,
		remainingRequests: 10,
	}),
	enforceOauthAuthorizeRateLimit: async () => ({
		allowed: mockRateLimitState.authorizeAllowed,
		retryAfterSeconds: mockRateLimitState.authorizeAllowed ? 0 : 30,
		remainingRequests: 10,
	}),
	isAuthenticationLockedOut: async () => false,
	recordFailedAuthentication: async () => {},
}));

mock.module('@web/lib/base-url', () => ({
	getBaseUrl: () => 'http://localhost:3000',
}));

mock.module('@web/lib/enterprise-authorization-policy', () => ({
	evaluateEnterpriseAuthorizationPolicy: async () => ({ allowed: true }),
}));

mock.module('@web/lib/hash-credential', () => ({
	hashCredential: (value: string) => `hashed:${value}`,
}));

mock.module('@web/lib/validate-redirect-uri', () => ({
	isValidRedirectUri: (uri: string) =>
		uri.startsWith('https://') || uri.startsWith('http://localhost'),
}));

mock.module('@web/lib/mcp-protocol-constants', () => ({
	mcpSupportedProtocolVersions: ['2025-11-25', '2026-07-28'],
	mcpLatestProtocolVersion: '2026-07-28',
	mcpUiExtensionIdentifier: 'io.modelcontextprotocol/ui',
	mcpEnterpriseAuthorizationExtensionIdentifier:
		'io.modelcontextprotocol/enterprise-managed-authorization',
}));

mock.module('@web/lib/cors', () => ({
	oauthCorsHeaders: { 'Access-Control-Allow-Origin': '*' },
}));

const {
	handleOauthAuthorizationMetadataGet,
	handleOauthProtectedResourceMetadataGet,
	handleOauthProtectedResourceMcpMetadataGet,
	handleOauthRegisterPost,
	handleOauthTokenPost,
	handleOauthRevokePost,
	handleOauthAuthorizeGet,
	handleOauthAuthorizeApprove,
	handleOauthAuthorizeDeny,
} = await import('@web/routes/oauth-routes');

import type { RequestContext } from '@web/lib/request-context';

function setEnvironment(overrides: Record<string, unknown>) {
	for (const key of Object.keys(mockEnvironment)) {
		delete mockEnvironment[key];
	}
	Object.assign(mockEnvironment, {
		MCP_ENABLE_UI_EXTENSION: true,
		MCP_ENABLE_ENTERPRISE_AUTH: false,
		MCP_TOKEN_TTL_SECONDS: 3600,
		MCP_REFRESH_TOKEN_TTL_SECONDS: 2592000,
		...overrides,
	});
}

function createContext(
	overrides: Partial<{
		url: string;
		method: string;
		headers: Record<string, string>;
		body: string;
		user: RequestContext['user'];
	}> = {},
): RequestContext {
	const url = overrides.url ?? 'http://localhost:3000/oauth/register';
	const request = new Request(url, {
		method: overrides.method ?? 'POST',
		headers: overrides.headers ?? { 'content-type': 'application/json' },
		body: overrides.body,
	});
	return {
		request,
		requestUrl: new URL(url),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: overrides.user ?? null,
		sessionToken: null,
	};
}

describe('authorization metadata endpoint', () => {
	beforeEach(() => {
		setEnvironment({});
	});

	it('returns correct JSON shape', async () => {
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-authorization-server',
		});
		const response = await handleOauthAuthorizationMetadataGet(context);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.issuer).toBe('http://localhost:3000');
		expect(body.authorization_endpoint).toBe('http://localhost:3000/oauth/authorize');
		expect(body.token_endpoint).toBe('http://localhost:3000/oauth/token');
		expect(body.registration_endpoint).toBe('http://localhost:3000/oauth/register');
	});

	it('never advertises client_credentials in grant types', async () => {
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-authorization-server',
		});
		const response = await handleOauthAuthorizationMetadataGet(context);
		const body = await response.json();
		expect(body.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
		expect((body.grant_types_supported as string[]).includes('client_credentials')).toBe(false);
	});

	it('never advertises the client_credentials extension', async () => {
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-authorization-server',
		});
		const response = await handleOauthAuthorizationMetadataGet(context);
		const body = (await response.json()) as { extensions: Record<string, unknown> };
		expect(body.extensions['io.modelcontextprotocol/oauth-client-credentials']).toBeUndefined();
	});
});

describe('protected resource metadata endpoint', () => {
	beforeEach(() => {
		setEnvironment({});
	});

	it('returns the resource URL', async () => {
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-protected-resource',
		});
		const response = await handleOauthProtectedResourceMetadataGet(context);
		const body = await response.json();
		expect(body.resource).toBe('http://localhost:3000/mcp');
		expect(body.authorization_servers).toEqual(['http://localhost:3000']);
	});
});

describe('protected resource MCP metadata endpoint', () => {
	beforeEach(() => {
		setEnvironment({});
	});

	it('includes the MCP protocol version', async () => {
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-protected-resource/mcp',
		});
		const response = await handleOauthProtectedResourceMcpMetadataGet(context);
		const body = await response.json();
		expect(body.mcp_protocol_version).toBe('2026-07-28');
		expect(body.bearer_methods_supported).toEqual(['header']);
	});
});

describe('client registration', () => {
	beforeEach(() => {
		setEnvironment({});
		mockInsertedValues = [];
	});

	it('returns 400 for invalid JSON', async () => {
		const context = createContext({
			body: 'not json{{{',
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(400);
	});

	it('returns 400 when redirect_uris is missing', async () => {
		const context = createContext({
			body: JSON.stringify({ client_name: 'Test App' }),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(400);
	});

	it('returns 201 for valid registration', async () => {
		const context = createContext({
			body: JSON.stringify({
				client_name: 'My App',
				redirect_uris: ['https://example.com/callback'],
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(201);
		const body = await response.json();
		expect(body.client_name).toBe('My App');
		expect(typeof body.client_id).toBe('string');
		expect(typeof body.client_secret).toBe('string');
	});

	it('rejects client_credentials in grant_types and creates no rows', async () => {
		const context = createContext({
			body: JSON.stringify({
				client_name: 'My App',
				redirect_uris: ['https://example.com/callback'],
				grant_types: ['authorization_code', 'client_credentials'],
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('invalid_client_metadata');
		expect(mockInsertedValues).toEqual([]);
	});

	it('returns 400 when refresh_token with auth_method none', async () => {
		const context = createContext({
			body: JSON.stringify({
				client_name: 'My App',
				redirect_uris: ['https://example.com/callback'],
				grant_types: ['authorization_code', 'refresh_token'],
				token_endpoint_auth_method: 'none',
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(400);
	});

	it('returns 400 for invalid redirect URI scheme', async () => {
		const context = createContext({
			body: JSON.stringify({
				client_name: 'My App',
				redirect_uris: ['http://not-localhost.com/callback'],
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(400);
	});

	it('returns 429 and performs no database write when rate-limited', async () => {
		mockRateLimitState.registrationAllowed = false;
		try {
			const context = createContext({
				body: JSON.stringify({
					client_name: 'My App',
					redirect_uris: ['https://example.com/callback'],
				}),
				headers: { 'content-type': 'application/json' },
			});
			const response = await handleOauthRegisterPost(context);
			expect(response.status).toBe(429);
			expect(mockInsertedValues).toEqual([]);
		} finally {
			mockRateLimitState.registrationAllowed = true;
		}
	});

	it('returns 413 and performs no database write for a body over the byte limit', async () => {
		const context = createContext({
			body: JSON.stringify({
				client_name: 'My App',
				redirect_uris: ['https://example.com/callback'],
				// The registration byte limit is 16KB; this padding alone is well over it.
				padding: 'x'.repeat(32 * 1024),
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(413);
		expect(mockInsertedValues).toEqual([]);
	});

	it('rejects a Content-Type other than application/json and performs no database write', async () => {
		const context = createContext({
			body: JSON.stringify({ client_name: 'My App', redirect_uris: ['https://example.com/cb'] }),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(400);
		expect(mockInsertedValues).toEqual([]);
	});

	it('rejects a client_name over the maximum length and performs no database write', async () => {
		const context = createContext({
			body: JSON.stringify({
				client_name: 'x'.repeat(500),
				redirect_uris: ['https://example.com/callback'],
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(400);
		expect(mockInsertedValues).toEqual([]);
	});

	it('rejects more redirect_uris than the maximum count and performs no database write', async () => {
		const context = createContext({
			body: JSON.stringify({
				client_name: 'My App',
				redirect_uris: Array.from({ length: 20 }, (_, index) => `https://example.com/cb${index}`),
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(400);
		expect(mockInsertedValues).toEqual([]);
	});
});

describe('token exchange', () => {
	beforeEach(() => {
		setEnvironment({});
		mockInsertedValues = [];
	});

	it('returns 400 for unsupported grant type', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: 'grant_type=implicit&client_id=c1',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('unsupported_grant_type');
	});

	it('returns 400 for unsupported content type', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: '<xml></xml>',
			headers: { 'content-type': 'application/xml' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('unsupported_content_type');
	});

	it('returns 429 before parsing the body when the network-scoped limit is exceeded', async () => {
		mockRateLimitState.tokenNetworkAllowed = false;
		try {
			const context = createContext({
				url: 'http://localhost:3000/oauth/token',
				body: 'grant_type=authorization_code&client_id=c1',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
			});
			const response = await handleOauthTokenPost(context);
			expect(response.status).toBe(429);
			expect(mockInsertedValues).toEqual([]);
		} finally {
			mockRateLimitState.tokenNetworkAllowed = true;
		}
	});

	it('returns 429 and performs no database write when the client-scoped limit is exceeded', async () => {
		mockRateLimitState.tokenClientAllowed = false;
		try {
			const context = createContext({
				url: 'http://localhost:3000/oauth/token',
				body: 'grant_type=authorization_code&client_id=c1&code=abc',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
			});
			const response = await handleOauthTokenPost(context);
			expect(response.status).toBe(429);
			expect(mockInsertedValues).toEqual([]);
		} finally {
			mockRateLimitState.tokenClientAllowed = true;
		}
	});

	it('rejects a duplicate parameter before any grant handling runs, with no database write', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: 'grant_type=authorization_code&code=a&code=b&client_id=c1',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('invalid_request');
		expect(mockInsertedValues).toEqual([]);
	});

	it('returns 413 and performs no database write for a body over the byte limit', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			// The token endpoint byte limit is 8KB.
			body: `grant_type=authorization_code&code=${'x'.repeat(16 * 1024)}`,
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(413);
		expect(mockInsertedValues).toEqual([]);
	});

	it('rejects a malformed code_verifier before any client lookup, with no database write', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: 'some-code',
				redirect_uri: 'https://example.com/cb',
				client_id: 'c1',
				code_verifier: 'too-short',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('invalid_grant');
		expect(mockInsertedValues).toEqual([]);
	});

	it('rejects a JSON body where a parameter is an array instead of a scalar string', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: JSON.stringify({
				grant_type: 'authorization_code',
				code: ['a', 'b'],
				redirect_uri: 'https://example.com/cb',
				client_id: 'c1',
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('invalid_request');
		expect(mockInsertedValues).toEqual([]);
	});
});

describe('token revocation', () => {
	beforeEach(() => {
		setEnvironment({});
		mockOauthTokens = [];
		mockOauthRefreshTokens = [];
	});

	it('returns 400 when token parameter is missing', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'nothing=here',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(400);
	});

	it('returns 200 even when token is not found (RFC 7009)', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=unknown-token',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(200);
	});

	it('returns 429 before parsing the body when revocation is rate-limited', async () => {
		mockRateLimitState.revokeAllowed = false;
		try {
			const context = createContext({
				url: 'http://localhost:3000/oauth/revoke',
				body: 'token=some-token',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
			});
			const response = await handleOauthRevokePost(context);
			expect(response.status).toBe(429);
		} finally {
			mockRateLimitState.revokeAllowed = true;
		}
	});

	it('returns 413 for a body over the byte limit', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			// The revoke endpoint byte limit is 4KB.
			body: `token=${'x'.repeat(8 * 1024)}`,
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(413);
	});

	it('rejects a duplicate token parameter', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=a&token=b',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('invalid_request');
	});

	it('rejects a token over the maximum length', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: `token=${'a'.repeat(1000)}`,
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(400);
	});
});

describe('authorization GET', () => {
	beforeEach(() => {
		setEnvironment({});
		mockOauthClients = [];
	});

	it('redirects to sign-in when user is not authenticated', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=abc',
			method: 'GET',
			user: null,
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toContain('/auth/google/start');
	});

	it('returns 400 when required params are missing', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});

	it('returns 400 when client is unknown', async () => {
		mockOauthClients = [];
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=unknown&redirect_uri=https://example.com/cb&response_type=code&code_challenge=abc',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});

	it('renders consent page when client is valid', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Test App',
				redirectUris: ['https://example.com/cb'],
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('Test App');
	});

	it('returns 400 for unsupported code_challenge_method', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=abc&code_challenge_method=plain',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});

	it('returns 400 when redirect URI does not match client', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Test App',
				redirectUris: ['https://example.com/other'],
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=abc',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});

	it('returns 429 when rate-limited', async () => {
		mockRateLimitState.authorizeAllowed = false;
		try {
			const context = createContext({
				url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=abc',
				method: 'GET',
				user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
			});
			const response = await handleOauthAuthorizeGet(context);
			expect(response.status).toBe(429);
		} finally {
			mockRateLimitState.authorizeAllowed = true;
		}
	});

	it('rejects a duplicate client_id query parameter', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&client_id=c2&redirect_uri=https://example.com/cb&response_type=code&code_challenge=abc',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});

	it('rejects a malformed code_challenge', async () => {
		mockOauthClients = [
			{ clientId: 'c1', clientName: 'Test App', redirectUris: ['https://example.com/cb'] },
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=too-short',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});
});

describe('authorization approve', () => {
	beforeEach(() => {
		setEnvironment({});
		mockOauthClients = [];
		mockInsertedValues = [];
	});

	it('returns 401 when user is not authenticated', async () => {
		const formData = new FormData();
		formData.set('client_id', 'c1');
		formData.set('redirect_uri', 'https://example.com/cb');
		formData.set('code_challenge', 'abc');
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({
				client_id: 'c1',
				redirect_uri: 'https://example.com/cb',
				code_challenge: 'abc',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: null,
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(401);
	});

	it('returns 400 when required fields are missing', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({ client_id: 'c1' }).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(400);
	});

	it('returns 400 for unsupported code_challenge_method', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({
				client_id: 'c1',
				redirect_uri: 'https://example.com/cb',
				code_challenge: 'abc',
				code_challenge_method: 'plain',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(400);
	});

	it('returns 413 and performs no database write for a body over the byte limit', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			// The approve endpoint byte limit is 4KB.
			body: new URLSearchParams({
				client_id: 'c1',
				redirect_uri: 'https://example.com/cb',
				code_challenge: 'x'.repeat(8 * 1024),
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(413);
		expect(mockInsertedValues).toEqual([]);
	});

	it('rejects a duplicate parameter and performs no database write', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: 'client_id=c1&client_id=c2&redirect_uri=https://example.com/cb&code_challenge=abc',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(400);
		expect(mockInsertedValues).toEqual([]);
	});

	it('rejects a malformed code_challenge and performs no database write', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({
				client_id: 'c1',
				redirect_uri: 'https://example.com/cb',
				code_challenge: 'too-short',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(400);
		expect(mockInsertedValues).toEqual([]);
	});
});

describe('authorization deny', () => {
	beforeEach(() => {
		setEnvironment({});
		mockOauthClients = [];
	});

	it('returns 401 when user is not authenticated', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/deny',
			body: new URLSearchParams({
				client_id: 'c1',
				redirect_uri: 'https://example.com/cb',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: null,
		});
		const response = await handleOauthAuthorizeDeny(context);
		expect(response.status).toBe(401);
	});

	it('returns 400 when redirect_uri is missing', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/deny',
			body: new URLSearchParams({ client_id: 'c1' }).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeDeny(context);
		expect(response.status).toBe(400);
	});
});

describe('authorization code token exchange', () => {
	beforeEach(() => {
		setEnvironment({});
		mockOauthClients = [];
	});

	it('returns 400 for missing required parameters', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: 'some-code',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('invalid_request');
	});

	it('returns 401 for unknown client', async () => {
		mockOauthClients = [];
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: 'some-code',
				redirect_uri: 'https://example.com/cb',
				client_id: 'unknown',
				code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(401);
	});

	it('returns 400 for missing refresh_token parameter', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: 'c1',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
	});

	it('returns unsupported_grant_type for client_credentials and mints no token', async () => {
		mockInsertedValues = [];
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'client_credentials',
				client_id: 'c1',
				client_secret: 'secret',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('unsupported_grant_type');
		expect(mockInsertedValues).toEqual([]);
	});
});
