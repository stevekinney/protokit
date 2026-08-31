import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { OAuthRequestContext } from '@lostgradient/mcp/oauth';

let capturedContext: OAuthRequestContext | undefined;
let capturedServingLayerInput: Record<string, unknown> | undefined;

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
			from: () => ({ where: () => ({ limit: async () => [] }) }),
		}),
	},
	schema: { users: { id: 'id', email: 'email', name: 'name', image: 'image', role: 'role' } },
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
});

describe('handleMcpRequestWithAuthentication', () => {
	it('assembles the extracted serving layer and preserves request identity', async () => {
		const request = new Request('http://localhost:3000/mcp', { method: 'POST' });
		const response = await handleMcpRequestWithAuthentication({
			request,
			requestUrl: new URL(request.url),
			requestId: 'request-1',
			networkIdentity: '203.0.113.7',
			user: null,
			sessionToken: null,
		});

		expect(response.status).toBe(202);
		expect(capturedServingLayerInput).toBeDefined();
		expect(capturedContext).toMatchObject({
			request,
			requestId: 'request-1',
			socketAddress: '203.0.113.7',
			identity: null,
		});
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
