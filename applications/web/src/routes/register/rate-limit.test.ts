import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/request-rate-limiter', () => ({
	enforceRegistrationRateLimit: vi.fn(async () => ({
		allowed: false,
		retryAfterSeconds: 15,
		remainingRequests: 0,
	})),
}));

const { POST } = await import('./+server');

describe('POST /register rate limit', () => {
	it('returns 429 with Retry-After when rate limited', async () => {
		const request = new Request('http://localhost/register', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				client_name: 'Test',
				redirect_uris: ['https://example.com/callback'],
			}),
		});

		const response = await POST({ request, getClientAddress: () => '127.0.0.1' } as never);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('15');
		expect(await response.json()).toEqual({
			error: 'rate_limited',
			error_description: 'Too many requests',
		});
	});
});
