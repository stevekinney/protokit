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
	mcpProtocolVersion: '2025-11-25',
}));

const { handleHealthGet } = await import('@web/routes/health-routes');

function setEnvironment(overrides: Record<string, unknown>) {
	for (const key of Object.keys(mockEnvironment)) {
		delete mockEnvironment[key];
	}
	Object.assign(mockEnvironment, {
		MCP_ENABLE_UI_EXTENSION: true,
		MCP_ENABLE_CLIENT_CREDENTIALS: true,
		MCP_ENABLE_ENTERPRISE_AUTH: false,
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
		const response = await handleHealthGet();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe('ok');
		expect(body.dependencies.redis).toBe('ok');
		expect(body.dependencies.database).toBe('ok');
	});

	it('returns 503 with degraded status when database is down', async () => {
		mockDatabaseHealthy = false;
		const response = await handleHealthGet();
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.dependencies.database).toBe('unavailable');
	});

	it('returns 503 with degraded status when Redis is down', async () => {
		mockRedisHealthy = false;
		const response = await handleHealthGet();
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.dependencies.redis).toBe('unavailable');
	});

	it('reports enterprise policy as unconfigured when enabled but not configured', async () => {
		setEnvironment({ MCP_ENABLE_ENTERPRISE_AUTH: true });
		const response = await handleHealthGet();
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.dependencies.enterprisePolicyBackend).toBe('unconfigured');
	});
});
