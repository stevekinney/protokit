import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/request-rate-limiter', () => ({
	enforceTokenRateLimit: vi.fn(async () => ({
		allowed: false,
		retryAfterSeconds: 8,
		remainingRequests: 0,
	})),
}));

const { POST } = await import('./+server');

describe('POST /token rate limit', () => {
	it('returns 429 with Retry-After when rate limited', async () => {
		const formData = new URLSearchParams({
			grant_type: 'authorization_code',
			code: 'code',
			redirect_uri: 'https://example.com/callback',
			client_id: 'client-id',
			code_verifier: 'verifier',
		});

		const request = new Request('http://localhost/token', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: formData.toString(),
		});

		const response = await POST({ request, getClientAddress: () => '127.0.0.1' } as never);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('8');
		expect(await response.json()).toEqual({
			error: 'rate_limited',
			error_description: 'Too many requests',
		});
	});
});
