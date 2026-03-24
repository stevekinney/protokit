import { describe, expect, it } from 'bun:test';
import { createRateLimitedResponse } from '@web/lib/rate-limit-response';

describe('createRateLimitedResponse', () => {
	it('returns 429 status', () => {
		const response = createRateLimitedResponse(60);
		expect(response.status).toBe(429);
	});

	it('sets the Retry-After header', () => {
		const response = createRateLimitedResponse(120);
		expect(response.headers.get('Retry-After')).toBe('120');
	});

	it('returns a rate_limited error body', async () => {
		const response = createRateLimitedResponse(30);
		const body = await response.json();
		expect(body).toMatchObject({ error: 'rate_limited' });
	});

	it('merges extra headers', () => {
		const response = createRateLimitedResponse(10, { 'X-Custom': 'value' });
		expect(response.headers.get('X-Custom')).toBe('value');
		expect(response.headers.get('Retry-After')).toBe('10');
	});
});
