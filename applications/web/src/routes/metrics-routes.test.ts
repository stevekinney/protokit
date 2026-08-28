import { describe, expect, it, mock, beforeEach } from 'bun:test';

const mockEnvironment: Record<string, unknown> = {};

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@lostgradient/mcp/metrics', () => ({
	metricsCollector: {
		snapshot: () => ({
			tools: {},
			uptimeSeconds: 100,
			collectedAt: '2026-01-01T00:00:00.000Z',
		}),
	},
}));

mock.module('@web/lib/request-rate-limiter', () => ({
	enforceMetricsRateLimit: async () => ({
		allowed: true,
		retryAfterSeconds: 0,
		remainingRequests: 10,
	}),
}));

const { handleMetricsGet } = await import('@web/routes/metrics-routes');

function buildContext(request: Request) {
	return {
		request,
		requestUrl: new URL(request.url),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: null,
		sessionToken: null,
	};
}

function setEnvironment(overrides: Record<string, unknown>) {
	for (const key of Object.keys(mockEnvironment)) {
		delete mockEnvironment[key];
	}
	Object.assign(mockEnvironment, { nodeEnv: 'test', ...overrides });
}

describe('handleMetricsGet', () => {
	beforeEach(() => {
		setEnvironment({});
	});

	it('returns 404 when no API key is configured', async () => {
		setEnvironment({ metricsApiKey: undefined });
		const response = await handleMetricsGet(
			buildContext(new Request('https://app.example.com/metrics')),
		);
		expect(response.status).toBe(404);
	});

	it('returns 401 when authorization header is missing', async () => {
		setEnvironment({ metricsApiKey: 'secret-key' });
		const response = await handleMetricsGet(
			buildContext(new Request('https://app.example.com/metrics')),
		);
		expect(response.status).toBe(401);
	});

	it('returns 401 when bearer token does not match', async () => {
		setEnvironment({ metricsApiKey: 'secret-key' });
		const response = await handleMetricsGet(
			buildContext(
				new Request('https://app.example.com/metrics', {
					headers: { authorization: 'Bearer wrong-key' },
				}),
			),
		);
		expect(response.status).toBe(401);
	});

	it('returns 200 with metrics snapshot when bearer token matches', async () => {
		setEnvironment({ metricsApiKey: 'secret-key' });
		const response = await handleMetricsGet(
			buildContext(
				new Request('https://app.example.com/metrics', {
					headers: { authorization: 'Bearer secret-key' },
				}),
			),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.tools).toEqual({});
		expect(typeof body.uptimeSeconds).toBe('number');
	});

	it('sets Cache-Control: no-store on every response shape', async () => {
		setEnvironment({ metricsApiKey: undefined });
		const notConfigured = await handleMetricsGet(
			buildContext(new Request('https://app.example.com/metrics')),
		);
		expect(notConfigured.headers.get('Cache-Control')).toBe('no-store');

		setEnvironment({ metricsApiKey: 'secret-key' });
		const unauthorized = await handleMetricsGet(
			buildContext(new Request('https://app.example.com/metrics')),
		);
		expect(unauthorized.headers.get('Cache-Control')).toBe('no-store');

		const authorized = await handleMetricsGet(
			buildContext(
				new Request('https://app.example.com/metrics', {
					headers: { authorization: 'Bearer secret-key' },
				}),
			),
		);
		expect(authorized.headers.get('Cache-Control')).toBe('no-store');
	});

	it('rejects a plaintext request in production even with a valid key', async () => {
		setEnvironment({ metricsApiKey: 'secret-key', nodeEnv: 'production' });
		const response = await handleMetricsGet(
			buildContext(
				new Request('http://app.example.com/metrics', {
					headers: { authorization: 'Bearer secret-key' },
				}),
			),
		);
		expect(response.status).toBe(400);
	});

	it('returns 429 with Retry-After and no-store when rate limited', async () => {
		setEnvironment({ metricsApiKey: 'secret-key' });
		mock.module('@web/lib/request-rate-limiter', () => ({
			enforceMetricsRateLimit: async () => ({
				allowed: false,
				retryAfterSeconds: 30,
				remainingRequests: 0,
			}),
		}));

		const response = await handleMetricsGet(
			buildContext(
				new Request('https://app.example.com/metrics', {
					headers: { authorization: 'Bearer secret-key' },
				}),
			),
		);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('30');
		expect(response.headers.get('Cache-Control')).toBe('no-store');

		mock.module('@web/lib/request-rate-limiter', () => ({
			enforceMetricsRateLimit: async () => ({
				allowed: true,
				retryAfterSeconds: 0,
				remainingRequests: 10,
			}),
		}));
	});

	// Review finding (P2): a disabled endpoint (metricsApiKey unset) must
	// return its promised 404 even when Redis -- which the rate limiter
	// depends on -- is unavailable. Before the fix, the rate-limit check ran
	// BEFORE the not-configured check, so this scenario threw instead of
	// returning 404, turning a disabled endpoint into a 500 that depends on
	// infrastructure it has no other reason to need.
	it('returns 404 when no API key is configured, even if the rate limiter would throw (Redis unavailable)', async () => {
		setEnvironment({ metricsApiKey: undefined });
		mock.module('@web/lib/request-rate-limiter', () => ({
			enforceMetricsRateLimit: async () => {
				throw new Error('simulated Redis unavailable');
			},
		}));

		const response = await handleMetricsGet(
			buildContext(new Request('https://app.example.com/metrics')),
		);
		expect(response.status).toBe(404);

		mock.module('@web/lib/request-rate-limiter', () => ({
			enforceMetricsRateLimit: async () => ({
				allowed: true,
				retryAfterSeconds: 0,
				remainingRequests: 10,
			}),
		}));
	});
});
