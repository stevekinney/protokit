import { describe, expect, it } from 'bun:test';
import { jsonResponse, redirectResponse } from '@web/lib/http-response';

describe('jsonResponse', () => {
	it('returns JSON content type by default', () => {
		const response = jsonResponse({ ok: true });
		expect(response.headers.get('Content-Type')).toBe('application/json');
	});

	it('does not override an explicit Content-Type header', () => {
		const response = jsonResponse(
			{ ok: true },
			{ headers: { 'Content-Type': 'application/vnd.custom+json' } },
		);
		expect(response.headers.get('Content-Type')).toBe('application/vnd.custom+json');
	});

	it('serializes the body as JSON', async () => {
		const response = jsonResponse({ count: 42 });
		expect(await response.json()).toEqual({ count: 42 });
	});
});

describe('redirectResponse', () => {
	it('defaults to 302 status', () => {
		const response = redirectResponse('/dashboard');
		expect(response.status).toBe(302);
	});

	it('uses a custom status when provided', () => {
		const response = redirectResponse('/dashboard', 307);
		expect(response.status).toBe(307);
	});

	it('sets the Location header', () => {
		const response = redirectResponse('https://example.com/callback');
		expect(response.headers.get('Location')).toBe('https://example.com/callback');
	});

	it('has a null body', () => {
		const response = redirectResponse('/');
		expect(response.body).toBeNull();
	});
});
