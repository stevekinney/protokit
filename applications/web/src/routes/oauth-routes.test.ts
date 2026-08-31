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
let mockUpdateCalls: Array<{ table: unknown; set: Record<string, unknown>; where?: unknown }> = [];
let mockDeleteCalls: Array<{ table: unknown; where: unknown }> = [];
let mockDeleteShouldThrow = false;
// Lets a test simulate losing the refresh-rotation mutex (a concurrent
// request revoked the row first) without also making the earlier read-only
// lookup that gathers insert values come back empty -- the real mutex
// UPDATE's `WHERE ... RETURNING` can match nothing even when a moment-old
// read saw the row as live.
let mockRefreshRotationMutexShouldMiss = false;
let mockExecuteCalls: unknown[] = [];
// Distinguishes the refresh grant's two, sequential `select()` calls
// against `oauthRefreshTokensTable` -- the first is the read-only "is this
// exact token currently live" lookup (`currentRefreshToken`), the second
// (only reached when the first comes back empty) is
// `respondToRefreshTokenNotFound`'s "was this token already used" replay
// lookup (`existingByHash`). The mock otherwise can't tell them apart,
// since it ignores `.where()` predicates entirely -- the same limitation
// `mockRefreshRotationMutexShouldMiss` above was already introduced to work
// around.
let mockOauthRefreshTokensSelectCallCount = 0;
let mockFirstRefreshTokenSelectShouldMiss = false;
let mockOldAccessTokenRevokeShouldThrow = false;
// A2 regression coverage: simulates the best-effort paired-refresh-token
// revoke (the `oauthRefreshTokens` update triggered by successfully
// revoking an access token) failing, mirroring
// `mockOldAccessTokenRevokeShouldThrow`'s existing shape for the reverse
// direction.
let mockPairedRefreshTokenRevokeShouldThrow = false;

const oauthClientsTable = Symbol('oauthClients');
// A plain object with real column-name properties (not a bare `Symbol`,
// unlike some of this file's other table stand-ins) so that a captured
// `.where(...)` predicate can be asserted against by column, needed to
// prove the review-finding regression test below (the reopen's `WHERE`
// clause) targets the right columns rather than just "some predicate ran".
const oauthCodesTable = {
	code: 'code',
	usedAt: 'usedAt',
};
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
						if (table === oauthRefreshTokensTable) {
							mockOauthRefreshTokensSelectCallCount += 1;
							if (
								mockFirstRefreshTokenSelectShouldMiss &&
								mockOauthRefreshTokensSelectCallCount === 1
							) {
								return Promise.resolve([]);
							}
							if (mockRefreshRotationMutexShouldMiss && mockOauthRefreshTokensSelectCallCount > 1) {
								return Promise.resolve(
									mockOauthRefreshTokens.map((token) => ({
										...(token as Record<string, unknown>),
										revokedAt: new Date(),
									})),
								);
							}
							return Promise.resolve(mockOauthRefreshTokens);
						}
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
				const call: { table: unknown; set: Record<string, unknown>; where?: unknown } = {
					table,
					set: setValues,
				};
				mockUpdateCalls.push(call);
				return {
					where: (where: unknown) => {
						call.where = where;
						// Round 10 review (P2): simulates the post-mutex/post-refresh-
						// revoke "revoke the paired old access token" step failing --
						// the specific `oauthTokens` update that never calls
						// `.returning()`, awaited bare, in both
						// `handleOauthTokenRefreshGrant` and
						// `handleOauthRevokePostInner`.
						if (mockOldAccessTokenRevokeShouldThrow && table === oauthTokensTable) {
							return Promise.reject(new Error('simulated old access token revoke failure'));
						}
						if (mockPairedRefreshTokenRevokeShouldThrow && table === oauthRefreshTokensTable) {
							return Promise.reject(new Error('simulated paired refresh token revoke failure'));
						}
						return {
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
						};
					},
				};
			},
		}),
		delete: (table: unknown) => ({
			where: (where: unknown) => {
				mockDeleteCalls.push({ table, where });
				if (mockDeleteShouldThrow) {
					return Promise.reject(new Error('simulated speculative cleanup failure'));
				}
				return Promise.resolve(undefined);
			},
		}),
		// OAUTH-003 / round 10: `revokeOauthRefreshTokenFamily` now issues a
		// single atomic CTE statement via `database.execute(sql\`...\`)`
		// instead of two separate `update()` calls -- see that function's own
		// comment. Records the call so tests can assert it ran without
		// needing to parse the raw SQL string.
		execute: async (query: unknown) => {
			mockExecuteCalls.push(query);
			// OPEN-12: token issuance for a refresh-token-capable client is now
			// a single CTE through `execute` rather than two sequential
			// `insert` calls, so the "issuance failed after the code was
			// consumed" tests have to be able to fail it here too. Same flag,
			// because the scenario under test is unchanged -- what varies is
			// only which database call performs the write.
			if (mockInsertShouldThrow) {
				throw new Error('simulated insert failure');
			}
			return { rows: [] };
		},
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
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
		{ raw: (value: string) => value },
	),
}));

const mockRateLimitState = {
	registrationAllowed: true,
	tokenNetworkAllowed: true,
	tokenClientAllowed: true,
	revokeAllowed: true,
	authorizeAllowed: true,
};

mock.module('@web/lib/request-rate-limiter', () => ({
	resolveOauthAtomicSlidingWindowStore: async () => ({
		consume: async ({ key }: { key: string }) => {
			if (key.includes('failed_authentication')) {
				recordFailedAuthenticationCalls.push({ key });
				return { allowed: true, retryAfterMilliseconds: 0, remainingRequests: 10 };
			}
			const allowed = key.includes('oauth_register')
				? mockRateLimitState.registrationAllowed
				: key.includes('oauth_token_network')
					? mockRateLimitState.tokenNetworkAllowed
					: key.includes('oauth_token_client')
						? mockRateLimitState.tokenClientAllowed
						: key.includes('oauth_revoke')
							? mockRateLimitState.revokeAllowed
							: true;
			return {
				allowed,
				retryAfterMilliseconds: allowed ? 0 : 30_000,
				remainingRequests: allowed ? 10 : 0,
			};
		},
		peek: async () => 0,
	}),
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

// The actual fetch/DNS/SSRF/schema logic is covered directly and
// exhaustively by client-metadata-documents.test.ts with injected
// dependencies. Mocked here so this file's authorize-handler tests can
// drive both branches (document fetched vs. not) without any network or
// DNS activity.
const mockCimdState: { document: Record<string, unknown> | null } = { document: null };
mock.module('@lostgradient/mcp/oauth/client-metadata-documents', () => ({
	isClientIdMetadataDocumentUrl: (clientId: string) => {
		try {
			const parsed = new URL(clientId);
			return parsed.protocol === 'https:' && parsed.pathname !== '' && parsed.pathname !== '/';
		} catch {
			return false;
		}
	},
	fetchClientIdMetadataDocument: async () => {
		return mockCimdState.document;
	},
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

const {
	handleOauthAuthorizationMetadataGet,
	handleOauthProtectedResourceMetadataGet,
	handleOauthProtectedResourceMcpMetadataGet,
	handleOauthRegisterPost,
	handleOauthTokenPost,
	handleOauthRevokePost,
} = await import('@web/routes/oauth-routes');

import type { RequestContext } from '@web/lib/request-context';

function setEnvironment(overrides: Record<string, unknown>) {
	for (const key of Object.keys(mockEnvironment)) {
		delete mockEnvironment[key];
	}
	Object.assign(mockEnvironment, {
		mcpEnableUiExtension: true,
		mcpTokenTtlSeconds: 3600,
		mcpRefreshTokenTtlSeconds: 2592000,
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
		mockOldAccessTokenRevokeShouldThrow = false;
		mockPairedRefreshTokenRevokeShouldThrow = false;
		mockUpdateCalls = [];
		mockExecuteCalls = [];
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
		mockOauthClients = [
			{ clientId: 'c1', clientName: 'Test App', redirectUris: [], tokenEndpointAuthMethod: 'none' },
		];
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

	// Round 10 review (P2): the same shape as the refresh grant's own
	// post-mutex access-token revoke (this file's "still returns the new
	// tokens when revoking the old access token fails after a successful
	// rotation" test) -- a sibling this branch shares, flagged explicitly
	// per the standing lesson on this pull request that a fix on one path
	// while its sibling goes untouched has recurred. The refresh token
	// revocation above already committed by the time the paired
	// access-token revoke runs; a failure there must not turn RFC 7009's
	// unconditional success response into a 500.
	it('still returns 200 when revoking the paired access token fails after a successful refresh token revocation', async () => {
		mockOauthClients = [
			{ clientId: 'c1', clientName: 'Test App', redirectUris: [], tokenEndpointAuthMethod: 'none' },
		];
		mockOauthRefreshTokens = [
			{ refreshToken: 'hashed-refresh', clientId: 'c1', accessTokenHash: 'hashed-access' },
		];
		mockOldAccessTokenRevokeShouldThrow = true;
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=some-refresh-token&client_id=c1&token_type_hint=refresh_token',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(200);
	});

	// A1 / RFC 7009 §2.1: "the authorization server MUST still be prepared
	// to handle a token that does not match the hint by extending its
	// search across all of the supported token types." The hint is only
	// allowed to choose search ORDER; it must never suppress the fallback
	// search. Before the fix, `token_type_hint=access_token` gated the
	// refresh-token branch on `token_type_hint !== 'access_token'`, which
	// was false here, so a refresh token mislabeled with that hint was never
	// even looked up in the refresh-token table -- it stayed fully live.
	it('A1: falls back to the refresh-token table when a refresh token is presented with token_type_hint=access_token', async () => {
		mockOauthClients = [
			{ clientId: 'c1', clientName: 'Test App', redirectUris: [], tokenEndpointAuthMethod: 'none' },
		];
		// No access token exists -- the hinted lookup must miss.
		mockOauthTokens = [];
		mockOauthRefreshTokens = [
			{
				refreshToken: 'hashed:some-refresh-token',
				clientId: 'c1',
				accessTokenHash: 'hashed-access',
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=some-refresh-token&client_id=c1&token_type_hint=access_token',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(200);
		// The fallback fired: the refresh-token table was actually revoked,
		// not merely skipped and silently reported as "success" via the
		// generic 200.
		const refreshRevokeCall = mockUpdateCalls.find(
			(call) => call.table === oauthRefreshTokensTable && call.set.revokedAt !== undefined,
		);
		expect(refreshRevokeCall).toBeTruthy();
	});

	// The symmetric mistake: an access token presented with
	// token_type_hint=refresh_token used to skip the access-token table
	// entirely once the (mislabeled) refresh-token lookup missed.
	it('A1: falls back to the access-token table when an access token is presented with token_type_hint=refresh_token', async () => {
		mockOauthClients = [
			{ clientId: 'c1', clientName: 'Test App', redirectUris: [], tokenEndpointAuthMethod: 'none' },
		];
		mockOauthRefreshTokens = [];
		mockOauthTokens = [{ accessToken: 'hashed:some-access-token', clientId: 'c1' }];
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=some-access-token&client_id=c1&token_type_hint=refresh_token',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(200);
		// The host store revokes the access token and any paired refresh token
		// together in one CTE.
		expect(mockExecuteCalls).toHaveLength(1);
	});

	// A2: revoking a live access token must also revoke the refresh token
	// paired with it (the row whose accessTokenHash references this access
	// token) -- otherwise the client can immediately use that still-live
	// refresh token to mint a replacement access token, undoing the
	// revocation. Mirrors the existing refresh-token-revoke -> paired
	// access-token-revoke direction below.
	it('A2: revoking a live access token also revokes its paired refresh token', async () => {
		mockOauthClients = [
			{ clientId: 'c1', clientName: 'Test App', redirectUris: [], tokenEndpointAuthMethod: 'none' },
		];
		mockOauthTokens = [{ accessToken: 'hashed:some-access-token', clientId: 'c1' }];
		mockOauthRefreshTokens = [
			{
				refreshToken: 'hashed:some-refresh-token',
				clientId: 'c1',
				accessTokenHash: 'hashed:some-access-token',
			},
		];
		const context = createContext({
			url: 'http://localhost:3000/oauth/revoke',
			body: 'token=some-access-token&client_id=c1&token_type_hint=access_token',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		const response = await handleOauthRevokePost(context);
		expect(response.status).toBe(200);
		const pairedRefreshRevokeCall = mockUpdateCalls.find(
			(call) => call.table === oauthRefreshTokensTable && call.set.revokedAt !== undefined,
		);
		expect(pairedRefreshRevokeCall).toBeTruthy();
	});

	it('A2: still returns 200 when revoking the paired refresh token fails after a successful access token revocation', async () => {
		mockOauthClients = [
			{ clientId: 'c1', clientName: 'Test App', redirectUris: [], tokenEndpointAuthMethod: 'none' },
		];
		mockOauthTokens = [{ accessToken: 'hashed:some-access-token', clientId: 'c1' }];
		mockOauthRefreshTokens = [
			{
				refreshToken: 'hashed:some-refresh-token',
				clientId: 'c1',
				accessTokenHash: 'hashed:some-access-token',
			},
		];
		mockOldAccessTokenRevokeShouldThrow = false;
		try {
			const context = createContext({
				url: 'http://localhost:3000/oauth/revoke',
				body: 'token=some-access-token&client_id=c1&token_type_hint=access_token',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
			});
			const response = await handleOauthRevokePost(context);
			expect(response.status).toBe(200);
		} finally {
			mockPairedRefreshTokenRevokeShouldThrow = false;
		}
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
		mockExecuteCalls = [];
		mockInsertShouldThrow = false;
		mockUpdateCalls = [];
		mockDeleteCalls = [];
		mockDeleteShouldThrow = false;
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
		// OPEN-12: both rows are now written by ONE statement rather than two
		// sequential inserts -- `neon-http` has no transactions, so the old
		// shape could leave an access token stored with no refresh token
		// beside it. Assert the single `execute` happened and that it carries
		// both tables, rather than counting inserts.
		expect(mockInsertedValues).toHaveLength(0);
		expect(mockExecuteCalls).toHaveLength(1);
		const issuedQuery = JSON.stringify(mockExecuteCalls[0]);
		expect(issuedQuery).toContain('oauth_tokens');
		expect(issuedQuery).toContain('oauth_refresh_tokens');
	});

	it('omits refresh_token when the client is not registered for the refresh_token grant', async () => {
		mockOauthClients = [
			{
				clientId: 'c1',
				tokenEndpointAuthMethod: 'none',
				clientSecret: null,
				grantTypes: ['authorization_code'],
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
		const response = await handleOauthTokenPost(validCodeGrantContext());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.access_token).toBeTruthy();
		expect(body.refresh_token).toBeUndefined();
		// Only the access-token row is written -- no unusable refresh token is
		// stored or returned for a client that cannot ever redeem it.
		expect(mockInsertedValues).toHaveLength(0);
		expect(mockExecuteCalls).toHaveLength(1);
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

		// The store issues the grant in one atomic CTE, so a failed statement
		// cannot leave an orphaned access token to delete.
		expect(mockDeleteCalls.some((call) => call.table === oauthTokensTable)).toBe(false);
		const reopenCall = mockUpdateCalls.find(
			(call) => call.table === oauthCodesTable && call.set.usedAt === null,
		);
		expect(reopenCall).toBeTruthy();
	});

	it('review finding (P2): the reopen predicate requires usedAt to still hold the exact value this handler wrote, so a concurrent revocation is not silently undone', async () => {
		// `revokeUserClientGrant`/`revokeAllUserGrants` (`consent-inventory.ts`)
		// now overwrite `used_at` unconditionally for every not-yet-expired
		// code, rather than skipping one that is already non-null. Before
		// this fix, revocation skipped an already-consumed code entirely,
		// and this `UPDATE` had no predicate at all beyond the code's own
		// hash -- it would have silently cleared `usedAt` back to `null`
		// regardless of a concurrent revocation, reopening a code the user
		// had just told the server to kill. Scoping the reopen to the exact
		// `usedAt` value this handler itself wrote means a revocation that
		// overwrites that value first makes the reopen match no row.
		seedValidAuthorizationCode();
		mockInsertShouldThrow = true;

		await expect(handleOauthTokenPost(validCodeGrantContext())).rejects.toThrow(
			'simulated insert failure',
		);

		const reopenCall = mockUpdateCalls.find(
			(call) => call.table === oauthCodesTable && call.set.usedAt === null,
		);
		expect(reopenCall).toBeTruthy();
		const predicate = reopenCall!.where as Array<{ column?: unknown; value?: unknown }>;
		expect(Array.isArray(predicate)).toBe(true);
		expect(predicate).toHaveLength(2);
		// The reopen must be scoped to this exact code row...
		expect(
			predicate.some((clause) => clause.column === oauthCodesTable.code && 'value' in clause),
		).toBe(true);
		// ...and must only clear `usedAt` if it still holds exactly the value
		// this handler itself wrote when it consumed the code (never an
		// unconditional clear).
		expect(
			predicate.some((clause) => clause.column === oauthCodesTable.usedAt && 'value' in clause),
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
		mockExecuteCalls = [];
		mockOauthRefreshTokensSelectCallCount = 0;
		mockFirstRefreshTokenSelectShouldMiss = false;
		mockOldAccessTokenRevokeShouldThrow = false;
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

		// The replacement pair is one atomic CTE, so a failed statement leaves
		// neither row behind and requires no compensating delete.
		expect(mockDeleteCalls.some((call) => call.table === oauthTokensTable)).toBe(false);
		expect(mockDeleteCalls.some((call) => call.table === oauthRefreshTokensTable)).toBe(false);
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

	it('still revokes the token family when speculative cleanup fails after losing the rotation race', async () => {
		mockRefreshRotationMutexShouldMiss = true;
		mockDeleteShouldThrow = true;
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
		expect(mockExecuteCalls).toHaveLength(2);
	});

	// Round 10 review (P1): `revokeOauthRefreshTokenFamily` used to be two
	// separate `update()` calls -- revoke the family, then revoke its access
	// tokens -- which could leave a family revoked with its access token
	// still live if the second call failed. Fixed by combining both
	// mutations into one atomic `database.execute(sql\`...\`)` CTE
	// statement, so the two-statement partial-failure window this finding
	// describes can no longer be reached at all. This proves the
	// CONSTRUCTION, not just the outcome: presenting an already-rotated
	// (replayed) refresh token must trigger exactly one `database.execute`
	// call and zero direct `update()` calls against either token table for
	// the family-revocation path -- not the old two-`update()`-call shape.
	it('revokes a replayed refresh token family with exactly one atomic statement, not two separate updates', async () => {
		mockFirstRefreshTokenSelectShouldMiss = false;
		mockOauthRefreshTokens = [
			{
				...(mockOauthRefreshTokens[0] as Record<string, unknown>),
				familyId: 'family-1',
				revokedAt: new Date(Date.now() - 60_000),
			},
		];
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

		// The atomic construction: one `database.execute` call for the whole
		// family revocation, not two separate `update()` calls against
		// `oauthRefreshTokensTable`/`oauthTokensTable`.
		expect(mockExecuteCalls).toHaveLength(1);
		expect(mockUpdateCalls.some((call) => call.table === oauthRefreshTokensTable)).toBe(false);
		expect(mockUpdateCalls.some((call) => call.table === oauthTokensTable)).toBe(false);
	});

	// Round 10 review (P2): the previous code awaited the old-access-token
	// revoke unguarded, AFTER the replacement pair was already inserted and
	// AFTER the mutex had already revoked the old refresh token -- both
	// committed. If this last step then threw, the whole handler threw too,
	// so the client received a 500 with no tokens at all while its old
	// refresh token was already dead: no usable retry path. Proves the fix:
	// a successful rotation still returns 200 with the new credentials even
	// when this best-effort cleanup step fails.
	it('still returns the new tokens when revoking the old access token fails after a successful rotation', async () => {
		mockOldAccessTokenRevokeShouldThrow = true;
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
		expect(body.access_token).toBeTruthy();
		expect(body.refresh_token).toBeTruthy();
	});
});
