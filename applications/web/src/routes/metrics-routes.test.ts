import { describe, expect, it, mock, beforeEach } from 'bun:test';

const mockEnvironment: Record<string, unknown> = {};

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@template/mcp/metrics', () => ({
	metricsCollector: {
		snapshot: () => ({
			tools: {},
			activeSessions: 0,
			uptimeSeconds: 100,
			collectedAt: '2026-01-01T00:00:00.000Z',
		}),
	},
}));

const { handleMetricsGet } = await import('@web/routes/metrics-routes');

function setEnvironment(overrides: Record<string, unknown>) {
	for (const key of Object.keys(mockEnvironment)) {
		delete mockEnvironment[key];
	}
	Object.assign(mockEnvironment, overrides);
}

describe('handleMetricsGet', () => {
	beforeEach(() => {
		setEnvironment({});
	});

	it('returns 404 when no API key is configured', async () => {
		setEnvironment({ METRICS_API_KEY: undefined });
		const request = new Request('http://localhost/metrics');
		const response = await handleMetricsGet(request);
		expect(response.status).toBe(404);
	});

	it('returns 401 when authorization header is missing', async () => {
		setEnvironment({ METRICS_API_KEY: 'secret-key' });
		const request = new Request('http://localhost/metrics');
		const response = await handleMetricsGet(request);
		expect(response.status).toBe(401);
	});

	it('returns 401 when bearer token does not match', async () => {
		setEnvironment({ METRICS_API_KEY: 'secret-key' });
		const request = new Request('http://localhost/metrics', {
			headers: { authorization: 'Bearer wrong-key' },
		});
		const response = await handleMetricsGet(request);
		expect(response.status).toBe(401);
	});

	it('returns 200 with metrics snapshot when bearer token matches', async () => {
		setEnvironment({ METRICS_API_KEY: 'secret-key' });
		const request = new Request('http://localhost/metrics', {
			headers: { authorization: 'Bearer secret-key' },
		});
		const response = await handleMetricsGet(request);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.tools).toEqual({});
		expect(body.activeSessions).toBe(0);
		expect(typeof body.uptimeSeconds).toBe('number');
	});
});
