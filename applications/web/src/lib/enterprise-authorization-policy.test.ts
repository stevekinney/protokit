import { describe, expect, it, mock, beforeEach } from 'bun:test';

const mockEnvironment: Record<string, unknown> = {};

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

const { evaluateEnterpriseAuthorizationPolicy } =
	await import('@web/lib/enterprise-authorization-policy');

function setEnvironment(overrides: Record<string, unknown>) {
	for (const key of Object.keys(mockEnvironment)) {
		delete mockEnvironment[key];
	}
	Object.assign(mockEnvironment, overrides);
}

describe('evaluateEnterpriseAuthorizationPolicy', () => {
	beforeEach(() => {
		setEnvironment({});
	});

	it('returns allowed when enterprise auth is disabled', async () => {
		setEnvironment({ MCP_ENABLE_ENTERPRISE_AUTH: false });
		const result = await evaluateEnterpriseAuthorizationPolicy({
			clientId: 'any-client',
			userId: 'any-user',
			action: 'issue_token',
		});
		expect(result).toEqual({ allowed: true });
	});

	it('returns denied when enabled but not configured', async () => {
		setEnvironment({ MCP_ENABLE_ENTERPRISE_AUTH: true });
		const result = await evaluateEnterpriseAuthorizationPolicy({
			clientId: 'any-client',
			userId: 'any-user',
			action: 'access_mcp',
		});
		expect(result).toEqual({ allowed: false, reason: 'enterprise_policy_not_configured' });
	});

	it('returns denied when allowed client IDs is empty', async () => {
		setEnvironment({
			MCP_ENABLE_ENTERPRISE_AUTH: true,
			ENTERPRISE_AUTH_PROVIDER_URL: 'https://auth.example.com',
			ENTERPRISE_AUTH_TENANT: 'tenant-1',
			ENTERPRISE_AUTH_AUDIENCE: 'audience-1',
			ENTERPRISE_AUTH_CLIENT_ID: 'auth-client-id',
			ENTERPRISE_AUTH_CLIENT_SECRET: 'auth-client-secret',
			ENTERPRISE_AUTH_ALLOWED_CLIENT_IDS: '',
		});
		const result = await evaluateEnterpriseAuthorizationPolicy({
			clientId: 'test-client',
			userId: 'user-1',
			action: 'issue_token',
		});
		expect(result).toEqual({ allowed: false, reason: 'enterprise_policy_denied' });
	});

	it('returns allowed when client ID matches', async () => {
		setEnvironment({
			MCP_ENABLE_ENTERPRISE_AUTH: true,
			ENTERPRISE_AUTH_PROVIDER_URL: 'https://auth.example.com',
			ENTERPRISE_AUTH_TENANT: 'tenant-1',
			ENTERPRISE_AUTH_AUDIENCE: 'audience-1',
			ENTERPRISE_AUTH_CLIENT_ID: 'auth-client-id',
			ENTERPRISE_AUTH_CLIENT_SECRET: 'auth-client-secret',
			ENTERPRISE_AUTH_ALLOWED_CLIENT_IDS: 'allowed-client,another-client',
		});
		const result = await evaluateEnterpriseAuthorizationPolicy({
			clientId: 'allowed-client',
			userId: 'user-1',
			action: 'access_mcp',
		});
		expect(result).toEqual({ allowed: true });
	});

	it('returns denied when client ID does not match', async () => {
		setEnvironment({
			MCP_ENABLE_ENTERPRISE_AUTH: true,
			ENTERPRISE_AUTH_PROVIDER_URL: 'https://auth.example.com',
			ENTERPRISE_AUTH_TENANT: 'tenant-1',
			ENTERPRISE_AUTH_AUDIENCE: 'audience-1',
			ENTERPRISE_AUTH_CLIENT_ID: 'auth-client-id',
			ENTERPRISE_AUTH_CLIENT_SECRET: 'auth-client-secret',
			ENTERPRISE_AUTH_ALLOWED_CLIENT_IDS: 'allowed-client',
		});
		const result = await evaluateEnterpriseAuthorizationPolicy({
			clientId: 'not-allowed-client',
			userId: 'user-1',
			action: 'issue_token',
		});
		expect(result).toEqual({ allowed: false, reason: 'enterprise_policy_denied' });
	});
});
