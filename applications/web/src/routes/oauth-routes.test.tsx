import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { hashCredential } from '@web/lib/hash-credential';

const mockEnvironment: Record<string, unknown> = {};
let mockOauthClients: unknown[] = [];
let mockOauthCodes: unknown[] = [];
let mockOauthTokens: unknown[] = [];
let mockOauthRefreshTokens: unknown[] = [];
let mockInsertedValues: unknown[] = [];
let recordFailedAuthenticationCalls: unknown[] = [];
let mockInsertShouldThrow = false;
let mockUpdateCalls: Array<{ table: unknown; set: Record<string, unknown> }> = [];
let mockDeleteCalls: Array<{ table: unknown; where: unknown }> = [];
// Lets a test simulate losing the refresh-rotation mutex (a concurrent
// request revoked the row first) without also making the earlier read-only
// lookup that gathers insert values come back empty -- the real mutex
// UPDATE's `WHERE ... RETURNING` can match nothing even when a moment-old
// read saw the row as live.
let mockRefreshRotationMutexShouldMiss = false;

const oauthClientsTable = Symbol('oauthClients');
const oauthCodesTable = Symbol('oauthCodes');
const oauthTokensTable = Symbol('oauthTokens');
const oauthRefreshTokensTable = {
	refreshToken: 'refreshToken',
	clientId: 'clientId',
	resource: 'resource',
	scope: 'scope',
	familyId: 'familyId',
	accessTokenHash: 'accessTokenHash',
	revokedAt: 'revokedAt',
	expiresAt: 'expiresAt',
};

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
						if (table === oauthRefreshTokensTable) return Promise.resolve(mockOauthRefreshTokens);
						return Promise.resolve([]);
					},
				}),
			}),
		}),
		insert: () => ({
			values: (values: unknown) => {
				mockInsertedValues.push(values);
				// Supports both call shapes used across this file: a bare
				// `await database.insert(...).values(...)` (registration), and
				// the CIMD upsert chain `.values(...).onConflictDoUpdate(...).returning()`.
				return {
					then: (resolve: (value: undefined) => void, reject: (reason: unknown) => void) => {
						if (mockInsertShouldThrow) {
							reject(new Error('simulated insert failure'));
							return;
						}
						resolve(undefined);
					},
					onConflictDoUpdate: () => ({
						returning: () => Promise.resolve([{ ...(values as Record<string, unknown>) }]),
					}),
				};
			},
		}),
		update: (table: unknown) => ({
			set: (setValues: Record<string, unknown>) => {
				mockUpdateCalls.push({ table, set: setValues });
				return {
					where: () => ({
						returning: () => {
							if (table === oauthCodesTable) return Promise.resolve(mockOauthCodes);
							if (table === oauthTokensTable) return Promise.resolve(mockOauthTokens);
							if (table === oauthRefreshTokensTable) {
								return Promise.resolve(
									mockRefreshRotationMutexShouldMiss ? [] : mockOauthRefreshTokens,
								);
							}
							return Promise.resolve([]);
						},
					}),
				};
			},
		}),
		delete: (table: unknown) => ({
			where: (where: unknown) => {
				mockDeleteCalls.push({ table, where });
				return Promise.resolve(undefined);
			},
		}),
	},
	schema: {
		oauthClients: oauthClientsTable,
		oauthCodes: oauthCodesTable,
		oauthTokens: oauthTokensTable,
		oauthRefreshTokens: oauthRefreshTokensTable,
		users: { id: 'id', email: 'email' },
	},
}));

mock.module('drizzle-orm', () => ({
	and: (...args: unknown[]) => args,
	eq: (column: unknown, value: unknown) => ({ column, value }),
	gt: (column: unknown, value: unknown) => ({ column, value }),
	isNull: (column: unknown) => ({ column }),
	inArray: (column: unknown, values: unknown) => ({ column, values }),
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
	recordFailedAuthentication: async (input: unknown) => {
		recordFailedAuthenticationCalls.push(input);
	},
}));

mock.module('@web/lib/base-url', () => ({
	getBaseUrl: () => 'http://localhost:3000',
}));

mock.module('@web/lib/hash-credential', () => ({
	hashCredential: (value: string) => `hashed:${value}`,
}));

mock.module('@web/lib/validate-redirect-uri', () => ({
	isValidRedirectUri: (uri: string) =>
		uri.startsWith('https://') || uri.startsWith('http://localhost'),
}));

// The actual fetch/DNS/SSRF/schema logic is covered directly and
// exhaustively by client-metadata-documents.test.ts with injected
// dependencies. Mocked here so this file's authorize-handler tests can
// drive both branches (document fetched vs. not) without any network or
// DNS activity.
const mockCimdState: { document: Record<string, unknown> | null } = { document: null };
mock.module('@web/lib/client-metadata-documents', () => ({
	isClientIdMetadataDocumentUrl: (clientId: string) => {
		try {
			const parsed = new URL(clientId);
			return parsed.protocol === 'https:' && parsed.pathname !== '' && parsed.pathname !== '/';
		} catch {
			return false;
		}
	},
	fetchClientIdMetadataDocument: async () => mockCimdState.document,
}));

mock.module('@web/lib/mcp-protocol-constants', () => ({
	mcpSupportedProtocolVersions: ['2025-11-25', '2026-07-28'],
	mcpLatestProtocolVersion: '2026-07-28',
	mcpUiExtensionIdentifier: 'io.modelcontextprotocol/ui',
}));

mock.module('@web/lib/cors', () => ({
	oauthCorsHeaders: { 'Access-Control-Allow-Origin': '*' },
}));

// Not mocked: isValidClientName is a small pure function, real-tested by
// client-name-validation.test.ts; using the real implementation here lets
// this suite prove the DCR schema actually enforces it end to end.

// Not mocked: isTrustedRequestOrigin is covered directly by
// csrf-protection.test.ts. bun's mock.module patches the shared module
// registry for the whole test process (not just this file), so mocking it
// here would leak into every other test file that imports the real
// module -- tests below instead set a real `sec-fetch-site` header.

// `createAuthorizationTransaction`/`consumeAuthorizationTransaction` have
// their own real-database coverage via `test:authorization-transaction`;
// mocked here so the route-level suite can drive every accept/reject path
// (missing, mismatched, expired, replayed, cross-session, cross-user)
// without standing up Postgres.
const mockAuthorizationTransactionState: {
	created: { transactionId: string; csrfToken: string };
	consumeResult: {
		clientId: string;
		redirectUri: string;
		codeChallenge: string;
		codeChallengeMethod: string;
		state: string | null;
		issuer: string;
		resource: string;
		scope: string;
	} | null;
} = {
	created: { transactionId: 'transaction-id', csrfToken: 'csrf-token' },
	consumeResult: null,
};
const consumeAuthorizationTransactionCalls: unknown[] = [];
const unconsumeAuthorizationTransactionCalls: unknown[] = [];
// AUTHZ-001: captures what `handleOauthAuthorizeGet` actually resolved and
// passed as `scope` -- the default-when-omitted set or the caller's own
// (already-validated) narrower request -- so tests below can assert on it
// without standing up Postgres.
const createAuthorizationTransactionCalls: unknown[] = [];
mock.module('@web/lib/authorization-transaction', () => ({
	createAuthorizationTransaction: async (input: unknown) => {
		createAuthorizationTransactionCalls.push(input);
		return mockAuthorizationTransactionState.created;
	},
	consumeAuthorizationTransaction: async (input: unknown) => {
		consumeAuthorizationTransactionCalls.push(input);
		return mockAuthorizationTransactionState.consumeResult;
	},
	unconsumeAuthorizationTransaction: async (transactionId: string) => {
		unconsumeAuthorizationTransactionCalls.push(transactionId);
	},
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
		sessionToken: string | null;
	}> = {},
): RequestContext {
	const url = overrides.url ?? 'http://localhost:3000/oauth/register';
	const request = new Request(url, {
		method: overrides.method ?? 'POST',
		// `sec-fetch-site: same-origin` by default so every existing test stays
		// same-origin for `isTrustedRequestOrigin` (approve/deny/CSRF checks);
		// a test proving the cross-site-rejection path overrides it explicitly.
		headers: {
			'sec-fetch-site': 'same-origin',
			...(overrides.headers ?? { 'content-type': 'application/json' }),
		},
		body: overrides.body,
	});
	return {
		request,
		requestUrl: new URL(url),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: overrides.user ?? null,
		sessionToken: overrides.sessionToken ?? (overrides.user ? 'session-token' : null),
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

	it('advertises client_id_metadata_document_supported (OAUTH-002)', async () => {
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-authorization-server',
		});
		const response = await handleOauthAuthorizationMetadataGet(context);
		const body = await response.json();
		expect(body.client_id_metadata_document_supported).toBe(true);
	});

	it('publishes scopes_supported (AUTHZ-001), never including the conformance-only audit:read scope', async () => {
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-authorization-server',
		});
		const response = await handleOauthAuthorizationMetadataGet(context);
		const body = (await response.json()) as { scopes_supported: string[] };
		expect(body.scopes_supported).toEqual(['profile:read', 'prompts:read']);
	});

	it('OAUTH-004: advertises authorization_response_iss_parameter_supported (RFC 9207)', async () => {
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-authorization-server',
		});
		const response = await handleOauthAuthorizationMetadataGet(context);
		const body = await response.json();
		expect(body.authorization_response_iss_parameter_supported).toBe(true);
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

	it('publishes the exact same scopes_supported as the authorization server metadata (AUTHZ-001)', async () => {
		const context = createContext({
			url: 'http://localhost:3000/.well-known/oauth-protected-resource',
		});
		const authorizationServerContext = createContext({
			url: 'http://localhost:3000/.well-known/oauth-authorization-server',
		});
		const response = await handleOauthProtectedResourceMetadataGet(context);
		const authorizationServerResponse = await handleOauthAuthorizationMetadataGet(
			authorizationServerContext,
		);
		const body = (await response.json()) as { scopes_supported: string[] };
		const authorizationServerBody = (await authorizationServerResponse.json()) as {
			scopes_supported: string[];
		};
		expect(body.scopes_supported).toEqual(authorizationServerBody.scopes_supported);
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
		// SEC-005 / S-10: a client secret is a credential; the response
		// carrying it must never be cacheable.
		expect(response.headers.get('Cache-Control')).toBe('no-store, private');
		expect(response.headers.get('Vary')).toBe('Cookie');
		// DATA-001 / S-18: "client secrets never expire" no longer holds -- a
		// real, future, non-zero epoch-seconds expiry is now returned instead
		// of RFC 7591's "0 means never expires" sentinel.
		expect(typeof body.client_secret_expires_at).toBe('number');
		expect(body.client_secret_expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
		expect(mockInsertedValues).toHaveLength(1);
		expect(
			(mockInsertedValues[0] as { clientSecretExpiresAt: Date }).clientSecretExpiresAt,
		).toBeInstanceOf(Date);
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

	it('OAUTH-002: allows refresh_token for a public client (auth_method none) and issues no client_secret', async () => {
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
		expect(response.status).toBe(201);
		const body = await response.json();
		expect(body.token_endpoint_auth_method).toBe('none');
		expect(body.client_secret).toBeUndefined();
		expect(body.client_secret_expires_at).toBeUndefined();
		expect(mockInsertedValues).toHaveLength(1);
		expect((mockInsertedValues[0] as { clientSecret: unknown }).clientSecret).toBeNull();
	});

	it('OAUTH-002: rejects application_type "web" combined with a loopback redirect_uri', async () => {
		const context = createContext({
			body: JSON.stringify({
				client_name: 'My App',
				redirect_uris: ['http://localhost:3000/callback'],
				application_type: 'web',
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(400);
		expect(mockInsertedValues).toEqual([]);
	});

	it('OAUTH-002: accepts application_type "native" with a loopback redirect_uri and echoes it back', async () => {
		const context = createContext({
			body: JSON.stringify({
				client_name: 'My App',
				redirect_uris: ['http://localhost:3000/callback'],
				application_type: 'native',
			}),
			headers: { 'content-type': 'application/json' },
		});
		const response = await handleOauthRegisterPost(context);
		expect(response.status).toBe(201);
		const body = await response.json();
		expect(body.application_type).toBe('native');
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
		recordFailedAuthenticationCalls = [];
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

	it('does not count an ordinary protocol error (400) toward the failed-authentication lockout', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: 'grant_type=implicit&client_id=c1',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		// Ten of these from one network identity must not trigger the shared
		// lockout: an unsupported grant type never attempted client
		// authentication.
		expect(recordFailedAuthenticationCalls).toEqual([]);
	});

	it('counts an actual client-authentication failure (401) toward the failed-authentication lockout', async () => {
		mockOauthClients = [];
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: 'some-code',
				redirect_uri: 'https://example.com/cb',
				client_id: 'unknown',
				code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
				resource: 'http://localhost:3000/mcp',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(401);
		expect(recordFailedAuthenticationCalls.length).toBe(1);
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
				resource: 'http://localhost:3000/mcp',
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
		mockOauthClients = [];
		recordFailedAuthenticationCalls = [];
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

	it('does not count an ordinary protocol error (missing client_id, 400) toward the shared lockout', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=some-token',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(400);
		expect(recordFailedAuthenticationCalls).toEqual([]);
	});

	it('counts an actual client-authentication failure (401) toward the shared lockout', async () => {
		mockOauthClients = [];
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=some-token&client_id=unknown-client',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(401);
		expect(recordFailedAuthenticationCalls.length).toBe(1);
	});

	it('returns 400 when client_id parameter is missing (OAUTH-003)', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=some-token',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('invalid_request');
	});

	it('returns 401 for an unregistered client (OAUTH-003)', async () => {
		mockOauthClients = [];
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=some-token&client_id=unknown-client',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(401);
	});

	it('returns 200 for an authenticated client revoking an unknown token (RFC 7009)', async () => {
		mockOauthClients = [{ clientId: 'c1', clientName: 'Test App', redirectUris: [] }];
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=unknown-token&client_id=c1',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(200);
	});

	it('DATA-001 / S-18: accepts a confidential client whose secret has not yet expired', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Test App',
				redirectUris: [],
				tokenEndpointAuthMethod: 'client_secret_post',
				clientSecret: hashCredential('correct-secret'),
				clientSecretExpiresAt: new Date(Date.now() + 60_000),
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=unknown-token&client_id=c1&client_secret=correct-secret',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(200);
	});

	it('DATA-001 / S-18: rejects a confidential client whose secret is correct but past clientSecretExpiresAt', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Test App',
				redirectUris: [],
				tokenEndpointAuthMethod: 'client_secret_post',
				clientSecret: hashCredential('correct-secret'),
				clientSecretExpiresAt: new Date(Date.now() - 1000),
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=unknown-token&client_id=c1&client_secret=correct-secret',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body.error).toBe('invalid_client');
	});

	it('DATA-001 / S-18: a client with no recorded clientSecretExpiresAt (legacy row) is not treated as expired', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Test App',
				redirectUris: [],
				tokenEndpointAuthMethod: 'client_secret_post',
				clientSecret: hashCredential('correct-secret'),
				clientSecretExpiresAt: null,
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=unknown-token&client_id=c1&client_secret=correct-secret',
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
		mockInsertedValues = [];
		mockCimdState.document = null;
		mockAuthorizationTransactionState.created = {
			transactionId: 'transaction-id',
			csrfToken: 'csrf-token',
		};
		createAuthorizationTransactionCalls.length = 0;
	});

	const authorizeClient = {
		clientId: 'c1',
		clientName: 'Test App',
		redirectUris: ['https://example.com/cb'],
		responseTypes: ['code'],
	};
	const authorizeUrlBase =
		'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp';
	const authorizeUser = {
		id: 'u1',
		email: 'alice@example.com',
		name: 'Alice',
		image: null,
		role: 'user',
	};

	describe('AUTHZ-001 scope resolution', () => {
		it('defaults to every supported scope when the client omits scope entirely', async () => {
			mockOauthClients = [authorizeClient];
			const response = await handleOauthAuthorizeGet(
				createContext({ url: authorizeUrlBase, method: 'GET', user: authorizeUser }),
			);
			expect(response.status).toBe(200);
			expect(createAuthorizationTransactionCalls).toHaveLength(1);
			const call = createAuthorizationTransactionCalls[0] as { scope: string };
			expect(call.scope).toBe('profile:read prompts:read');
		});

		it('narrows to exactly the client-requested, canonicalized subset', async () => {
			mockOauthClients = [authorizeClient];
			const response = await handleOauthAuthorizeGet(
				createContext({
					url: `${authorizeUrlBase}&scope=${encodeURIComponent('prompts:read profile:read prompts:read')}`,
					method: 'GET',
					user: authorizeUser,
				}),
			);
			expect(response.status).toBe(200);
			const call = createAuthorizationTransactionCalls[0] as { scope: string };
			expect(call.scope).toBe('profile:read prompts:read');
		});

		it('rejects an unsupported scope token before creating a transaction', async () => {
			mockOauthClients = [authorizeClient];
			const response = await handleOauthAuthorizeGet(
				createContext({
					url: `${authorizeUrlBase}&scope=${encodeURIComponent('profile:read admin:everything')}`,
					method: 'GET',
					user: authorizeUser,
				}),
			);
			expect(response.status).toBe(400);
			const body = await response.text();
			expect(body).toContain('Unsupported scope');
			expect(createAuthorizationTransactionCalls).toHaveLength(0);
		});

		it('rejects a duplicate scope query parameter', async () => {
			const response = await handleOauthAuthorizeGet(
				createContext({
					url: `${authorizeUrlBase}&scope=profile:read&scope=prompts:read`,
					method: 'GET',
					user: authorizeUser,
				}),
			);
			expect(response.status).toBe(400);
		});

		it('renders a human-readable description for every granted scope on the consent page', async () => {
			mockOauthClients = [authorizeClient];
			const response = await handleOauthAuthorizeGet(
				createContext({
					url: `${authorizeUrlBase}&scope=${encodeURIComponent('profile:read')}`,
					method: 'GET',
					user: authorizeUser,
				}),
			);
			const body = await response.text();
			expect(body).toContain('Read your profile information');
		});
	});

	it('OAUTH-002: an https client_id with no matching row fetches and upserts a Client ID Metadata Document', async () => {
		mockCimdState.document = {
			clientId: 'https://app.example.com/oauth/client.json',
			clientName: 'CIMD App',
			redirectUris: ['https://app.example.com/callback'],
			grantTypes: ['authorization_code', 'refresh_token'],
			responseTypes: ['code'],
			applicationType: null,
		};
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=https%3A%2F%2Fapp.example.com%2Foauth%2Fclient.json&redirect_uri=https://app.example.com/callback&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('CIMD App');
		expect(mockInsertedValues).toHaveLength(1);
		const inserted = mockInsertedValues[0] as Record<string, unknown>;
		expect(inserted.clientId).toBe('https://app.example.com/oauth/client.json');
		expect(inserted.clientSecret).toBeNull();
		expect(inserted.tokenEndpointAuthMethod).toBe('none');
		expect(inserted.clientType).toBe('public');
		expect(inserted.clientIdMetadataUrl).toBe('https://app.example.com/oauth/client.json');
	});

	it('OAUTH-002: renders "Unknown OAuth client" when a Client ID Metadata Document cannot be fetched or fails validation, and writes no row', async () => {
		mockCimdState.document = null;
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=https%3A%2F%2Fapp.example.com%2Foauth%2Fclient.json&redirect_uri=https://app.example.com/callback&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
		const body = await response.text();
		expect(body).toContain('Unknown OAuth client');
		expect(mockInsertedValues).toEqual([]);
	});

	it('redirects to sign-in when user is not authenticated', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
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
			url: 'http://localhost:3000/oauth/authorize?client_id=unknown&redirect_uri=https://example.com/cb&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});

	it('rejects response_type=code for a client registered with an empty response_types array', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Test App',
				redirectUris: ['https://example.com/cb'],
				responseTypes: [],
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
		const body = await response.text();
		expect(body).toContain('not registered for the code response type');
		expect(createAuthorizationTransactionCalls).toHaveLength(0);
	});

	it('renders consent page with an opaque transaction id and csrf token, never the raw client/redirect/PKCE values', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Test App',
				redirectUris: ['https://example.com/cb'],
				responseTypes: ['code'],
			},
		];
		mockAuthorizationTransactionState.created = {
			transactionId: 'created-transaction-id',
			csrfToken: 'created-csrf-token',
		};
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('Test App');
		expect(body).toContain('created-transaction-id');
		expect(body).toContain('created-csrf-token');
		expect(body).not.toContain('name="client_id"');
		expect(body).not.toContain('name="code_challenge"');
	});

	it('returns 400 for unsupported code_challenge_method', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=abc&code_challenge_method=plain&resource=http://localhost:3000/mcp',
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
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});

	it('OAUTH-004: accepts a loopback redirect_uri whose port differs from the registered one', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Test App',
				redirectUris: ['http://localhost:1234/callback'],
				responseTypes: ['code'],
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=http://localhost:54321/callback&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(200);
	});

	it('OAUTH-004: rejects a loopback redirect_uri whose path differs from every registered entry, even with port flexibility', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Test App',
				redirectUris: ['http://localhost:1234/callback'],
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=http://localhost:54321/other&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});

	it('OAUTH-004: rejects a hosted HTTPS redirect_uri whose host is merely a lookalike suffix of the registered one', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Test App',
				redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://claude.ai.evil.com/api/mcp/auth_callback&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});

	it("OAUTH-004: accepts Claude's hosted callback URI when registered exactly", async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				clientName: 'Claude',
				redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
				responseTypes: ['code'],
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://claude.ai/api/mcp/auth_callback&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(200);
	});

	it('returns 429 when rate-limited', async () => {
		mockRateLimitState.authorizeAllowed = false;
		try {
			const context = createContext({
				url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
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
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&client_id=c2&redirect_uri=https://example.com/cb&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&resource=http://localhost:3000/mcp',
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
			url: 'http://localhost:3000/oauth/authorize?client_id=c1&redirect_uri=https://example.com/cb&response_type=code&code_challenge=too-short&resource=http://localhost:3000/mcp',
			method: 'GET',
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeGet(context);
		expect(response.status).toBe(400);
	});
});

describe('authorization approve', () => {
	const validTransaction = {
		clientId: 'c1',
		redirectUri: 'https://example.com/cb',
		codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
		codeChallengeMethod: 'S256',
		state: 'state-xyz',
		issuer: 'http://localhost:3000',
		resource: 'http://localhost:3000/mcp',
		scope: 'profile:read',
	};

	beforeEach(() => {
		setEnvironment({});
		mockOauthClients = [];
		mockInsertedValues = [];
		mockAuthorizationTransactionState.consumeResult = validTransaction;
		consumeAuthorizationTransactionCalls.length = 0;
		unconsumeAuthorizationTransactionCalls.length = 0;
		mockInsertShouldThrow = false;
	});

	it('reopens the authorization transaction when the code insert fails, so the approval form can be retried', async () => {
		mockInsertShouldThrow = true;
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({
				transaction_id: 'transaction-id',
				csrf_token: 'csrf-token',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});

		// The transaction was already consumed by the time the insert fails
		// (this codebase's atomic revoke-then-check pattern); without the
		// fix, that consumption is permanent and the same form can never be
		// resubmitted. This asserts the compensating un-consume runs.
		await expect(handleOauthAuthorizeApprove(context)).rejects.toThrow('simulated insert failure');
		expect(unconsumeAuthorizationTransactionCalls).toEqual(['transaction-id']);
	});

	it('returns 401 when user is not authenticated', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({
				transaction_id: 'transaction-id',
				csrf_token: 'csrf-token',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: null,
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(401);
	});

	it('returns 403 for a cross-site request even with valid fields', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({
				transaction_id: 'transaction-id',
				csrf_token: 'csrf-token',
			}).toString(),
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'cross-site',
			},
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(403);
		expect(mockInsertedValues).toEqual([]);
	});

	it('returns 400 when required fields are missing', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({ transaction_id: 'transaction-id' }).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(400);
	});

	it('returns 400 and performs no database write when the transaction cannot be consumed (missing, mismatched, expired, replayed, cross-session, or cross-user)', async () => {
		mockAuthorizationTransactionState.consumeResult = null;
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({
				transaction_id: 'transaction-id',
				csrf_token: 'wrong-csrf-token',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(400);
		expect(mockInsertedValues).toEqual([]);
	});

	it('passes the session token and user id to the atomic consume call', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({
				transaction_id: 'transaction-id',
				csrf_token: 'csrf-token',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
			sessionToken: 'the-session-token',
		});
		await handleOauthAuthorizeApprove(context);
		expect(consumeAuthorizationTransactionCalls).toEqual([
			{
				transactionId: 'transaction-id',
				csrfToken: 'csrf-token',
				userId: 'u1',
				sessionToken: 'the-session-token',
			},
		]);
	});

	it('returns 413 and performs no database write for a body over the byte limit', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({
				transaction_id: 'x'.repeat(8 * 1024),
				csrf_token: 'csrf-token',
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
			body: 'transaction_id=t1&transaction_id=t2&csrf_token=csrf-token',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(400);
		expect(mockInsertedValues).toEqual([]);
	});

	it('rejects a transaction_id over the maximum length and performs no database write', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: new URLSearchParams({
				transaction_id: 'x'.repeat(1024),
				csrf_token: 'csrf-token',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(400);
		expect(mockInsertedValues).toEqual([]);
	});

	it('issues a code and redirects using only the transaction record, ignoring any other posted field', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: 'transaction_id=transaction-id&csrf_token=csrf-token&redirect_uri=https://evil.example.com/steal',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(302);
		const location = response.headers.get('Location')!;
		expect(location.startsWith('https://example.com/cb?')).toBe(true);
		expect(location).toContain('code=');
		expect(location).toContain('state=state-xyz');
		expect(mockInsertedValues).toHaveLength(1);
	});

	it('OAUTH-004: includes the transaction-bound issuer as iss (RFC 9207), never re-derived from the request', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: 'transaction_id=transaction-id&csrf_token=csrf-token',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		const location = new URL(response.headers.get('Location')!);
		expect(location.searchParams.get('iss')).toBe('http://localhost:3000');
	});

	it('AUTHZ-001: copies the transaction record scope onto the issued code, never re-deriving it from the form', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/approve',
			body: 'transaction_id=transaction-id&csrf_token=csrf-token&scope=admin:everything',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeApprove(context);
		expect(response.status).toBe(302);
		expect((mockInsertedValues[0] as { scope: string }).scope).toBe('profile:read');
	});
});

describe('authorization deny', () => {
	const validTransaction = {
		clientId: 'c1',
		redirectUri: 'https://example.com/cb',
		codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
		codeChallengeMethod: 'S256',
		state: 'state-xyz',
		issuer: 'http://localhost:3000',
		resource: 'http://localhost:3000/mcp',
		scope: 'profile:read',
	};

	beforeEach(() => {
		setEnvironment({});
		mockOauthClients = [];
		mockAuthorizationTransactionState.consumeResult = validTransaction;
	});

	it('returns 401 when user is not authenticated', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/deny',
			body: new URLSearchParams({
				transaction_id: 'transaction-id',
				csrf_token: 'csrf-token',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: null,
		});
		const response = await handleOauthAuthorizeDeny(context);
		expect(response.status).toBe(401);
	});

	it('returns 403 for a cross-site request', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/deny',
			body: new URLSearchParams({
				transaction_id: 'transaction-id',
				csrf_token: 'csrf-token',
			}).toString(),
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'cross-site',
			},
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeDeny(context);
		expect(response.status).toBe(403);
	});

	it('returns 400 when required fields are missing', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/deny',
			body: new URLSearchParams({ transaction_id: 'transaction-id' }).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeDeny(context);
		expect(response.status).toBe(400);
	});

	it('returns 400 when the transaction cannot be consumed', async () => {
		mockAuthorizationTransactionState.consumeResult = null;
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/deny',
			body: new URLSearchParams({
				transaction_id: 'transaction-id',
				csrf_token: 'csrf-token',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeDeny(context);
		expect(response.status).toBe(400);
	});

	it('redirects with access_denied using only the transaction record', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/deny',
			body: new URLSearchParams({
				transaction_id: 'transaction-id',
				csrf_token: 'csrf-token',
				redirect_uri: 'https://evil.example.com/steal',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeDeny(context);
		expect(response.status).toBe(302);
		const location = response.headers.get('Location')!;
		expect(location.startsWith('https://example.com/cb?')).toBe(true);
		expect(location).toContain('error=access_denied');
		expect(location).toContain('state=state-xyz');
	});

	it('OAUTH-004: includes the transaction-bound issuer as iss (RFC 9207) on the error response too', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/authorize/deny',
			body: new URLSearchParams({
				transaction_id: 'transaction-id',
				csrf_token: 'csrf-token',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			user: { id: 'u1', email: 'alice@example.com', name: 'Alice', image: null, role: 'user' },
		});
		const response = await handleOauthAuthorizeDeny(context);
		const location = new URL(response.headers.get('Location')!);
		expect(location.searchParams.get('iss')).toBe('http://localhost:3000');
	});
});

describe('authorization code token exchange', () => {
	beforeEach(() => {
		setEnvironment({});
		mockOauthClients = [];
		mockOauthCodes = [];
		mockOauthTokens = [];
		mockOauthRefreshTokens = [];
		mockInsertedValues = [];
		mockInsertShouldThrow = false;
		mockUpdateCalls = [];
		mockDeleteCalls = [];
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
				resource: 'http://localhost:3000/mcp',
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

	// RFC 7636 Appendix B's canonical example verifier/challenge pair.
	const validCodeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
	const validCodeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
	function seedValidAuthorizationCode(): void {
		mockOauthClients = [
			{
				clientId: 'c1',
				tokenEndpointAuthMethod: 'none',
				clientSecret: null,
				grantTypes: ['authorization_code', 'refresh_token'],
			},
		];
		mockOauthCodes = [
			{
				code: 'hashed:valid-code',
				clientId: 'c1',
				userId: 'u1',
				redirectUri: 'https://example.com/cb',
				codeChallenge: validCodeChallenge,
				codeChallengeMethod: 'S256',
				resource: 'http://localhost:3000/mcp',
				scope: 'profile:read',
				usedAt: null,
				expiresAt: new Date(Date.now() + 60000),
			},
		];
	}
	function validCodeGrantContext(): ReturnType<typeof createContext> {
		return createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: 'valid-code',
				redirect_uri: 'https://example.com/cb',
				client_id: 'c1',
				code_verifier: validCodeVerifier,
				resource: 'http://localhost:3000/mcp',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
	}

	it('mints an access token and a refresh token from a valid authorization code', async () => {
		seedValidAuthorizationCode();
		const response = await handleOauthTokenPost(validCodeGrantContext());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.access_token).toBeTruthy();
		expect(body.refresh_token).toBeTruthy();
		expect(mockInsertedValues).toHaveLength(2);
	});

	it('reopens the authorization code and removes the orphaned access-token row when token issuance fails after the code is consumed', async () => {
		seedValidAuthorizationCode();
		mockInsertShouldThrow = true;

		// Without the fix, the `usedAt` update above (which already ran before
		// the insert failed) is permanent -- the code can never be retried,
		// and any access-token row the first (successful) insert wrote before
		// the second insert threw would be left orphaned and undisclosed.
		await expect(handleOauthTokenPost(validCodeGrantContext())).rejects.toThrow(
			'simulated insert failure',
		);

		expect(mockDeleteCalls.some((call) => call.table === oauthTokensTable)).toBe(true);
		expect(
			mockUpdateCalls.some((call) => call.table === oauthCodesTable && call.set.usedAt === null),
		).toBe(true);
	});
});

describe('AUTHZ-001 refresh grant scope narrowing / escalation', () => {
	beforeEach(() => {
		setEnvironment({});
		mockOauthClients = [
			{
				clientId: 'c1',
				tokenEndpointAuthMethod: 'none',
				clientSecret: null,
				grantTypes: ['authorization_code', 'refresh_token'],
			},
		];
		mockOauthRefreshTokens = [
			{
				refreshToken: 'hashed:refresh-token-value',
				clientId: 'c1',
				userId: 'u1',
				scope: 'profile:read',
				resource: 'http://localhost:3000/mcp',
				accessTokenHash: 'hashed:old-access-token',
				familyId: 'family-1',
				revokedAt: null,
				expiresAt: new Date(Date.now() + 60000),
			},
		];
		mockOauthTokens = [
			{
				accessToken: 'hashed:old-access-token',
				revokedAt: null,
			},
		];
		mockInsertedValues = [];
		mockInsertShouldThrow = false;
		mockUpdateCalls = [];
		mockDeleteCalls = [];
		mockRefreshRotationMutexShouldMiss = false;
	});

	it('carries the stored scope forward when the refresh request omits scope entirely', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: 'c1',
				refresh_token: 'refresh-token-value',
				resource: 'http://localhost:3000/mcp',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.scope).toBe('profile:read');
	});

	it('rejects a refresh scope request that exceeds the originally granted scope, minting no new token', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: 'c1',
				refresh_token: 'refresh-token-value',
				resource: 'http://localhost:3000/mcp',
				scope: 'profile:read prompts:read',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('invalid_scope');
		expect(mockInsertedValues).toEqual([]);
	});

	it('accepts a refresh scope request that narrows to a subset of the original grant', async () => {
		mockOauthRefreshTokens = [
			{
				...(mockOauthRefreshTokens[0] as Record<string, unknown>),
				scope: 'profile:read prompts:read',
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: 'c1',
				refresh_token: 'refresh-token-value',
				resource: 'http://localhost:3000/mcp',
				scope: 'profile:read',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.scope).toBe('profile:read');
	});

	it('rejects an unrecognized scope token before any database write', async () => {
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: 'c1',
				refresh_token: 'refresh-token-value',
				resource: 'http://localhost:3000/mcp',
				scope: 'admin:everything',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('invalid_scope');
		expect(mockInsertedValues).toEqual([]);
	});

	it('does not revoke the old refresh token when minting its replacement fails, so the original stays usable', async () => {
		mockInsertShouldThrow = true;
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: 'c1',
				refresh_token: 'refresh-token-value',
				resource: 'http://localhost:3000/mcp',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});

		// P1 (review round 6): the replacement pair is now inserted *before*
		// the mutex revoke, precisely so a failed insert never needs to
		// un-revoke anything -- nothing was revoked yet. Without that
		// ordering, the old revoke-then-insert code would have already
		// burned the client's only refresh token by the time this insert
		// failure surfaced.
		await expect(handleOauthTokenPost(context)).rejects.toThrow('simulated insert failure');

		// Best-effort cleanup of whatever was written before the throw.
		expect(mockDeleteCalls.some((call) => call.table === oauthTokensTable)).toBe(true);
		expect(mockDeleteCalls.some((call) => call.table === oauthRefreshTokensTable)).toBe(true);
		// Nothing was ever revoked -- the mutex UPDATE against
		// `oauthRefreshTokensTable` never ran, so there is no `revokedAt`
		// write to compensate for.
		expect(mockUpdateCalls.some((call) => call.table === oauthRefreshTokensTable)).toBe(false);
	});

	it('deletes the speculative replacement pair, without touching the old token, when it loses the rotation race', async () => {
		// Simulate losing the mutex: the read-only lookup that gathers insert
		// values still sees the token as live, but the mutex UPDATE's own
		// `WHERE ... RETURNING` matches nothing -- exactly like a concurrent
		// winner having already revoked the row a moment after this request's
		// own read.
		mockRefreshRotationMutexShouldMiss = true;
		const context = createContext({
			url: 'http://localhost:3000/oauth/token',
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: 'c1',
				refresh_token: 'refresh-token-value',
				resource: 'http://localhost:3000/mcp',
			}).toString(),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});

		const response = await handleOauthTokenPost(context);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('invalid_grant');

		// The speculative replacement pair this request inserted before
		// attempting the mutex must be deleted once the mutex loses.
		expect(mockDeleteCalls.some((call) => call.table === oauthTokensTable)).toBe(true);
		expect(mockDeleteCalls.some((call) => call.table === oauthRefreshTokensTable)).toBe(true);
	});
});
