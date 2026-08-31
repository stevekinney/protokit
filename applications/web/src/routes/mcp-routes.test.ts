import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { OAuthRequestContext } from '@lostgradient/mcp/oauth';

let capturedContext: OAuthRequestContext | undefined;
let capturedServingLayerInput: Record<string, unknown> | undefined;
let databaseQueryCount = 0;

mock.module('@lostgradient/mcp/http', () => ({
	createMcpHttpServingLayer: (input: Record<string, unknown>) => {
		capturedServingLayerInput = input;
		return {
			handle: async (context: OAuthRequestContext) => {
				capturedContext = context;
				return new Response('served', { status: 202 });
			},
		};
	},
}));

mock.module('@lostgradient/mcp', () => ({
	getSupportedScopes: () => ['profile:read'],
	templateRegistry: { tools: [], resources: [], prompts: [] },
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: () => ({
						limit: async () => {
							databaseQueryCount += 1;
							return [
								{
									accessTokenHash: 'hashed-token',
									clientId: 'client-1',
									userId: 'user-1',
									scope: 'profile:read',
									resource: 'http://localhost:3000/mcp',
									expiresAt: new Date('2099-01-01'),
									revokedAt: null,
									createdAt: new Date('2026-01-01'),
									profileId: 'user-1',
									profileEmail: 'user@example.com',
									profileName: 'User',
									profileImage: null,
									profileRole: 'user',
								},
							];
						},
					}),
				}),
			}),
		}),
	},
	schema: {
		oauthTokens: {
			accessToken: 'accessToken',
			clientId: 'clientId',
			userId: 'userId',
			scope: 'scope',
			resource: 'resource',
			expiresAt: 'expiresAt',
			revokedAt: 'revokedAt',
			createdAt: 'createdAt',
		},
		users: { id: 'id', email: 'email', name: 'name', image: 'image', role: 'role' },
	},
}));

mock.module('@web/env', () => ({
	environment: {
		mcpAllowedOrigins: 'http://localhost:3000',
		mcpConformanceMode: false,
		protokitTunnelActive: false,
		rateLimitFailedAuthMax: 5,
	},
}));

const rateLimiter = { consume: async () => ({ allowed: true }) };
mock.module('@web/lib/request-rate-limiter', () => ({
	createSharedRequestRateLimiter: () => rateLimiter,
}));

mock.module('@web/lib/mcp-concurrency-limiter', () => ({
	acquireMcpConcurrencySlot: async () => ({ allowed: true, release: async () => {} }),
}));

mock.module('@web/lib/mcp-handler', () => ({ handleMcpRequest: async () => new Response() }));
mock.module('@web/lib/mcp-origin-validation', () => ({
	parseAllowedOrigins: () => new Set(['http://localhost:3000']),
}));
mock.module('@web/lib/mcp-request-context', () => ({
	getMcpResourceUrl: () => 'http://localhost:3000/mcp',
}));
mock.module('@web/lib/mcp-protocol-constants', () => ({
	mcpLatestProtocolVersion: '2026-07-28',
}));
mock.module('@web/lib/oauth-stateless-stores', () => ({
	oauthStatelessStores: { tokens: {} },
}));
mock.module('@web/lib/hash-credential', () => ({ hashCredential: (value: string) => value }));

const { handleMcpRequestWithAuthentication, isDnsRebindingProtectionActive } =
	await import('@web/routes/mcp-routes');

afterEach(() => {
	capturedContext = undefined;
	capturedServingLayerInput = undefined;
	databaseQueryCount = 0;
});

describe('handleMcpRequestWithAuthentication', () => {
	it('assembles the extracted serving layer and preserves request identity', async () => {
		const request = new Request('http://localhost:3000/mcp', { method: 'POST' });
		const response = await handleMcpRequestWithAuthentication({
			request,
			requestUrl: new URL(request.url),
			requestId: 'request-1',
			clientAddress: '10.0.0.8',
			networkIdentity: '203.0.113.7',
			user: null,
			sessionToken: null,
		});

		expect(response.status).toBe(202);
		expect(capturedServingLayerInput).toBeDefined();
		expect(
			typeof (capturedServingLayerInput?.authenticationSeams as Record<string, unknown>)
				.findTokenAndUserProfileByHash,
		).toBe('function');
		expect(capturedContext).toMatchObject({
			request,
			requestId: 'request-1',
			socketAddress: '10.0.0.8',
			identity: null,
		});

		const findTokenAndUserProfileByHash = (
			capturedServingLayerInput?.authenticationSeams as {
				findTokenAndUserProfileByHash: (tokenHash: string) => Promise<unknown>;
			}
		).findTokenAndUserProfileByHash;
		expect(await findTokenAndUserProfileByHash('hashed-token')).toMatchObject({
			token: { accessTokenHash: 'hashed-token', userId: 'user-1' },
			profile: { id: 'user-1', email: 'user@example.com' },
		});
		expect(databaseQueryCount).toBe(1);
	});
});

describe('OAuth-only imports', () => {
	it('do not statically import the MCP transport handler', async () => {
		const source = await Bun.file(
			new URL('../lib/oauth-stateless-seams.ts', import.meta.url),
		).text();
		expect(source).not.toMatch(/import\s+[^;]*['"]@web\/lib\/mcp-handler['"]/s);
	});
});

describe('isDnsRebindingProtectionActive', () => {
	it('is active only without conformance mode or a tunnel', () => {
		expect(
			isDnsRebindingProtectionActive({ conformanceModeConfigured: false, tunnelActive: false }),
		).toBe(true);
		expect(
			isDnsRebindingProtectionActive({ conformanceModeConfigured: true, tunnelActive: false }),
		).toBe(false);
		expect(
			isDnsRebindingProtectionActive({ conformanceModeConfigured: false, tunnelActive: true }),
		).toBe(false);
	});
});
