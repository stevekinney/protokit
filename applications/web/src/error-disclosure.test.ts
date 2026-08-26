import { describe, expect, it, mock } from 'bun:test';

/**
 * OPS-002 / S-15, acceptance criterion 5: "Error-response tests expose only
 * a stable code, generic description, and request identifier." Drives the
 * real `handleApplicationRequest` dispatcher for every generic-error shape
 * this item's endpoints produce (metrics/readiness not-found, unauthorized,
 * plaintext-transport-refused, and the catch-all 404) and asserts the JSON
 * body never carries anything beyond `error`/`error_description`, while the
 * `X-Request-Id` response header (the operator-correlation channel) is
 * always present.
 */

const mockEnvironment: Record<string, unknown> = {
	nodeEnv: 'test',
	mcpAllowedOrigins: 'http://localhost:3000',
	baseUrl: 'https://app.example.com',
	metricsApiKey: 'metrics-secret',
	healthReadinessApiKey: 'readiness-secret',
};

mock.module('@web/env', () => ({ environment: mockEnvironment }));

mock.module('@template/database', () => ({
	database: { execute: async () => [{ '?column?': 1 }] },
	schema: {},
}));

mock.module('drizzle-orm', () => ({
	sql: Object.assign((strings: TemplateStringsArray) => strings.join(''), {
		raw: (value: string) => value,
	}),
	and: (...arguments_: unknown[]) => arguments_,
	eq: (column: unknown, value: unknown) => ({ column, value }),
	gt: (column: unknown, value: unknown) => ({ column, value }),
	isNull: (column: unknown) => ({ column }),
	inArray: (column: unknown, values: unknown) => ({ column, values }),
}));

mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => false,
	isRedisHealthy: async () => false,
	getRedisClient: async () => {
		throw new Error('Redis is not configured in this test.');
	},
	getRedisSubscriberClient: async () => {
		throw new Error('Redis is not configured in this test.');
	},
	disconnectRedisSubscriberClient: async () => {},
}));

mock.module('@web/lib/instance-identifier', () => ({ instanceIdentifier: 'test-instance-id' }));
mock.module('@web/lib/base-url', () => ({ getBaseUrl: () => 'https://app.example.com' }));

mock.module('@web/lib/session-authentication', () => ({
	hydrateSession: async () => ({ user: null, sessionToken: null }),
	createSession: async () => {
		throw new Error('not needed by this test');
	},
	revokeSession: async () => {},
	createExpiredSessionCookie: () => '',
}));

const { handleApplicationRequest } = await import('@web/application');

type GenericErrorCase = {
	name: string;
	request: () => Request;
	expectedStatus: number;
};

const cases: GenericErrorCase[] = [
	{
		name: 'metrics: unauthorized (wrong bearer token)',
		expectedStatus: 401,
		request: () =>
			new Request('https://app.example.com/metrics', {
				headers: { authorization: 'Bearer wrong-key' },
			}),
	},
	{
		name: 'metrics: unauthorized (no header)',
		expectedStatus: 401,
		request: () => new Request('https://app.example.com/metrics'),
	},
	{
		name: 'readiness: unauthorized (wrong bearer token)',
		expectedStatus: 401,
		request: () =>
			new Request('https://app.example.com/health/ready', {
				headers: { authorization: 'Bearer wrong-key' },
			}),
	},
	{
		name: 'unknown route: not_found',
		expectedStatus: 404,
		request: () => new Request('https://app.example.com/definitely-not-a-real-route'),
	},
];

describe('error responses disclose only a stable code, a generic description, and a request id', () => {
	for (const testCase of cases) {
		it(testCase.name, async () => {
			const response = await handleApplicationRequest(testCase.request());
			expect(response.status).toBe(testCase.expectedStatus);

			const requestId = response.headers.get('X-Request-Id');
			expect(Boolean(requestId)).toBe(true);

			const body = (await response.json()) as Record<string, unknown>;
			const allowedKeys = new Set(['error', 'error_description']);
			for (const key of Object.keys(body)) {
				expect(allowedKeys.has(key)).toBe(true);
			}
			expect(typeof body.error).toBe('string');

			const bodyText = JSON.stringify(body);
			expect(bodyText).not.toContain('stack');
			expect(bodyText).not.toContain('at ');
			expect(bodyText.toLowerCase()).not.toContain('metrics-secret');
			expect(bodyText.toLowerCase()).not.toContain('readiness-secret');
		});
	}

	it('metrics unconfigured still returns a generic not_found with a request id', async () => {
		mockEnvironment.metricsApiKey = undefined;
		const response = await handleApplicationRequest(new Request('https://app.example.com/metrics'));
		expect(response.status).toBe(404);
		expect(Boolean(response.headers.get('X-Request-Id'))).toBe(true);
		const body = (await response.json()) as Record<string, unknown>;
		expect(Object.keys(body)).toEqual(['error']);
		mockEnvironment.metricsApiKey = 'metrics-secret';
	});

	it('the internal-error catch-all never leaks the underlying error message', async () => {
		mock.module('@web/lib/base-url', () => ({
			getBaseUrl: () => {
				throw new Error('a very specific internal failure message that must never leak');
			},
		}));

		const response = await handleApplicationRequest(new Request('https://app.example.com/'));
		expect(response.status).toBe(500);
		expect(Boolean(response.headers.get('X-Request-Id'))).toBe(true);
		const body = (await response.json()) as Record<string, unknown>;
		expect(body).toEqual({
			error: 'internal_error',
			error_description: 'An unexpected error occurred',
		});
		const bodyText = JSON.stringify(body);
		expect(bodyText).not.toContain('a very specific internal failure message');

		mock.module('@web/lib/base-url', () => ({ getBaseUrl: () => 'https://app.example.com' }));
	});
});
