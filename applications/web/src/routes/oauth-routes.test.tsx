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

mock.module('@web/lib/request-rate-limiter', () => ({
	enforceOauthRegistrationRateLimit: async () => ({
		allowed: true,
		retryAfterSeconds: 0,
		remainingRequests: 10,
	}),
	enforceOauthTokenRateLimit: async () => ({
		allowed: true,
		retryAfterSeconds: 0,
		remainingRequests: 10,
	}),
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
	mcpProtocolVersion: '2025-11-25',
	mcpUiExtensionIdentifier: 'io.modelcontextprotocol/ui',
	mcpOauthClientCredentialsExtensionIdentifier: 'io.modelcontextprotocol/oauth-client-credentials',
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
		MCP_ENABLE_CLIENT_CREDENTIALS: true,
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

	it('includes client_credentials in grant types when enabled', async () => {
		setEnvironment({ MCP_ENABLE_CLIENT_CREDENTIALS: true });
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-authorization-server',
		});
		const response = await handleOauthAuthorizationMetadataGet(context);
		const body = await response.json();
		expect(body.grant_types_supported).toContain('client_credentials');
	});

	it('excludes client_credentials when disabled', async () => {
		setEnvironment({ MCP_ENABLE_CLIENT_CREDENTIALS: false });
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-authorization-server',
		});
		const response = await handleOauthAuthorizationMetadataGet(context);
		const body = await response.json();
		expect((body.grant_types_supported as string[]).includes('client_credentials')).toBe(false);
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
		expect(body.mcp_protocol_version).toBe('2025-11-25');
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

	it('returns 400 when client_credentials is disabled', async () => {
		setEnvironment({ MCP_ENABLE_CLIENT_CREDENTIALS: false });
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
	});

	it('returns 400 when client_credentials with auth_method none', async () => {
		setEnvironment({ MCP_ENABLE_CLIENT_CREDENTIALS: true });
		const context = createContext({
			body: JSON.stringify({
				client_name: 'My App',
				redirect_uris: ['https://example.com/callback'],
				grant_types: ['authorization_code', 'client_credentials'],
				token_endpoint_auth_method: 'none',
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(400);
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
});

describe('token exchange', () => {
	beforeEach(() => {
		setEnvironment({});
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
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=abc',
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
				code_verifier: 'verifier',
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

	it('returns 400 for client_credentials when disabled', async () => {
		setEnvironment({ MCP_ENABLE_CLIENT_CREDENTIALS: false });
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
	});
});
