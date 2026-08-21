import { describe, expect, it, mock, beforeEach } from 'bun:test';

const mockEnvironment: Record<string, unknown> = {};
let mockDatabaseHealthy = true;
let mockRedisHealthy = true;

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@template/database', () => ({
	database: {
		execute: async () => {
			if (!mockDatabaseHealthy) throw new Error('database down');
			return [{ '?column?': 1 }];
		},
	},
}));

mock.module('drizzle-orm', () => ({
	sql: Object.assign((strings: TemplateStringsArray) => strings.join(''), {
		raw: (value: string) => value,
	}),
}));

mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => true,
	isRedisHealthy: async () => mockRedisHealthy,
}));

mock.module('@web/lib/instance-identifier', () => ({
	instanceIdentifier: 'test-instance-id',
}));

mock.module('@web/lib/mcp-protocol-constants', () => ({
	mcpSupportedProtocolVersions: ['2025-11-25', '2026-07-28'],
}));

mock.module('@web/lib/request-rate-limiter', () => ({
	enforceHealthProbeRateLimit: async () => ({
		allowed: true,
		retryAfterSeconds: 0,
		remainingRequests: 10,
	}),
}));

const { handleHealthGet } = await import('@web/routes/health-routes');

const testContext = {
	request: new Request('http://localhost/health'),
	requestUrl: new URL('http://localhost/health'),
	requestId: 'req-1',
	networkIdentity: '203.0.113.1',
	user: null,
	sessionToken: null,
};

function setEnvironment(overrides: Record<string, unknown>) {
	for (const key of Object.keys(mockEnvironment)) {
		delete mockEnvironment[key];
	}
	Object.assign(mockEnvironment, {
		MCP_ENABLE_UI_EXTENSION: true,
		...overrides,
	});
}

describe('handleHealthGet', () => {
	beforeEach(() => {
		mockDatabaseHealthy = true;
		mockRedisHealthy = true;
		setEnvironment({});
	});

	it('returns 200 with ok status when all dependencies are healthy', async () => {
		const response = await handleHealthGet(testContext);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe('ok');
		expect(body.dependencies.redis).toBe('ok');
		expect(body.dependencies.database).toBe('ok');
	});

	it('returns 503 with degraded status when database is down', async () => {
		mockDatabaseHealthy = false;
		const response = await handleHealthGet(testContext);
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.dependencies.database).toBe('unavailable');
	});

	it('returns 503 with degraded status when Redis is down', async () => {
		mockRedisHealthy = false;
		const response = await handleHealthGet(testContext);
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.dependencies.redis).toBe('unavailable');
	});

	it('never advertises the enterprise-managed authorization extension', async () => {
		const response = await handleHealthGet(testContext);
		const body = await response.json();
		expect(body.extensions).not.toHaveProperty('enterpriseManagedAuthorization');
		expect(body.dependencies).not.toHaveProperty('enterprisePolicyBackend');
	});
});
