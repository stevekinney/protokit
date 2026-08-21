import { describe, expect, it, mock, beforeEach } from 'bun:test';

const mockEnvironment: Record<string, unknown> = {};
let mockDatabaseHealthy = true;
let mockRedisHealthy = true;
let mockDatabaseCallCount = 0;

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@template/database', () => ({
	database: {
		execute: async () => {
			mockDatabaseCallCount += 1;
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

const { handleHealthGet, handleHealthReadinessGet, resetHealthReadinessCacheForTests } =
	await import('@web/routes/health-routes');

function buildContext(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		request: new Request('https://app.example.com/health/ready', {
			headers: { authorization: 'Bearer readiness-key' },
		}),
		requestUrl: new URL('https://app.example.com/health/ready'),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: null,
		sessionToken: null,
		...overrides,
	};
}

function setEnvironment(overrides: Record<string, unknown>) {
	for (const key of Object.keys(mockEnvironment)) {
		delete mockEnvironment[key];
	}
	Object.assign(mockEnvironment, {
		MCP_ENABLE_UI_EXTENSION: true,
		NODE_ENV: 'test',
		HEALTH_READINESS_API_KEY: 'readiness-key',
		HEALTH_READINESS_CACHE_TTL_SECONDS: 2,
		...overrides,
	});
}

describe('handleHealthGet', () => {
	beforeEach(() => {
		mockDatabaseHealthy = true;
		mockRedisHealthy = true;
		setEnvironment({});
	});

	it('returns 200 with only a status field, no dependency or topology detail', async () => {
		const response = handleHealthGet();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ status: 'ok' });
	});

	it('reports ok even when the database and Redis are both down', async () => {
		mockDatabaseHealthy = false;
		mockRedisHealthy = false;
		const response = handleHealthGet();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ status: 'ok' });
	});
});

describe('handleHealthReadinessGet', () => {
	beforeEach(() => {
		mockDatabaseHealthy = true;
		mockRedisHealthy = true;
		setEnvironment({});
		resetHealthReadinessCacheForTests();
	});

	it('returns 404 when no readiness key is configured', async () => {
		setEnvironment({ HEALTH_READINESS_API_KEY: undefined });
		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(404);
	});

	it('returns 401 when no authorization header is presented', async () => {
		const response = await handleHealthReadinessGet(
			buildContext({ request: new Request('https://app.example.com/health/ready') }),
		);
		expect(response.status).toBe(401);
	});

	it('returns 401 when the bearer token does not match', async () => {
		const response = await handleHealthReadinessGet(
			buildContext({
				request: new Request('https://app.example.com/health/ready', {
					headers: { authorization: 'Bearer wrong-key' },
				}),
			}),
		);
		expect(response.status).toBe(401);
	});

	it('returns 200 with full dependency detail when authorized and healthy', async () => {
		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe('ok');
		expect(body.instanceIdentifier).toBe('test-instance-id');
		expect(body.dependencies.redis).toBe('ok');
		expect(body.dependencies.database).toBe('ok');
	});

	it('returns 503 with degraded status when the database is down', async () => {
		mockDatabaseHealthy = false;
		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.dependencies.database).toBe('unavailable');
	});

	it('returns 503 with degraded status when Redis is down', async () => {
		mockRedisHealthy = false;
		const response = await handleHealthReadinessGet(buildContext());
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.dependencies.redis).toBe('unavailable');
	});

	it('sets Cache-Control: no-store on every response shape', async () => {
		const authorized = await handleHealthReadinessGet(buildContext());
		expect(authorized.headers.get('Cache-Control')).toBe('no-store');

		setEnvironment({ HEALTH_READINESS_API_KEY: undefined });
		const notConfigured = await handleHealthReadinessGet(buildContext());
		expect(notConfigured.headers.get('Cache-Control')).toBe('no-store');
	});

	it('never advertises the enterprise-managed authorization extension', async () => {
		const response = await handleHealthReadinessGet(buildContext());
		const body = await response.json();
		expect(body.extensions).not.toHaveProperty('enterpriseManagedAuthorization');
		expect(body.dependencies).not.toHaveProperty('enterprisePolicyBackend');
	});

	it('coalesces and caches the dependency probe across requests within the TTL window', async () => {
		mockDatabaseCallCount = 0;

		await Promise.all([
			handleHealthReadinessGet(buildContext()),
			handleHealthReadinessGet(buildContext()),
			handleHealthReadinessGet(buildContext()),
		]);
		await handleHealthReadinessGet(buildContext());

		expect(mockDatabaseCallCount).toBe(1);
	});

	it('rejects a request over plaintext transport in production', async () => {
		setEnvironment({ NODE_ENV: 'production' });
		const response = await handleHealthReadinessGet(
			buildContext({
				request: new Request('http://app.example.com/health/ready', {
					headers: { authorization: 'Bearer readiness-key' },
				}),
			}),
		);
		expect(response.status).toBe(400);
	});
});
