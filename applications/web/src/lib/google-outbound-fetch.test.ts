import { describe, expect, it } from 'bun:test';
import {
	fetchGoogleEndpointBounded,
	GoogleOutboundFetchError,
} from '@web/lib/google-outbound-fetch';

const baseInit = {
	method: 'GET' as const,
	timeoutMs: 1000,
	expectedContentType: 'application/json',
	maxResponseBytes: 100,
	expectedHost: 'example.com',
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: { 'content-type': 'application/json', ...init.headers },
	});
}

describe('fetchGoogleEndpointBounded', () => {
	it('returns the status and text on a well-formed response', async () => {
		const result = await fetchGoogleEndpointBounded('https://example.com/token', baseInit, {
			fetchImpl: async () => jsonResponse({ ok: true }),
		});
		expect(result.status).toBe(200);
		expect(JSON.parse(result.text)).toEqual({ ok: true });
	});

	it('rejects a non-https URL', async () => {
		await expect(
			fetchGoogleEndpointBounded('http://example.com/token', baseInit, {
				fetchImpl: async () => jsonResponse({}),
			}),
		).rejects.toThrow(GoogleOutboundFetchError);
	});

	it('rejects a URL whose host does not match the expected host', async () => {
		await expect(
			fetchGoogleEndpointBounded('https://evil.example.com/token', baseInit, {
				fetchImpl: async () => jsonResponse({}),
			}),
		).rejects.toThrow(GoogleOutboundFetchError);
	});

	it('rejects when fetch throws (network error, timeout, redirect)', async () => {
		await expect(
			fetchGoogleEndpointBounded('https://example.com/token', baseInit, {
				fetchImpl: async () => {
					throw new TypeError('fetch failed');
				},
			}),
		).rejects.toThrow(GoogleOutboundFetchError);
	});

	it('rejects a wrong content type', async () => {
		await expect(
			fetchGoogleEndpointBounded('https://example.com/token', baseInit, {
				fetchImpl: async () =>
					new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
			}),
		).rejects.toThrow(GoogleOutboundFetchError);
	});

	it('rejects a response whose declared Content-Length exceeds the limit', async () => {
		await expect(
			fetchGoogleEndpointBounded('https://example.com/token', baseInit, {
				fetchImpl: async () => jsonResponse({}, { headers: { 'content-length': '99999' } }),
			}),
		).rejects.toThrow(GoogleOutboundFetchError);
	});

	it('rejects a response whose actual body exceeds the limit despite an honest or missing Content-Length', async () => {
		const oversizedBody = 'x'.repeat(baseInit.maxResponseBytes + 1);
		await expect(
			fetchGoogleEndpointBounded('https://example.com/token', baseInit, {
				fetchImpl: async () =>
					new Response(oversizedBody, { headers: { 'content-type': 'application/json' } }),
			}),
		).rejects.toThrow(GoogleOutboundFetchError);
	});

	it('passes through the AbortSignal timeout to the fetch implementation', async () => {
		let sawSignal = false;
		await fetchGoogleEndpointBounded('https://example.com/token', baseInit, {
			fetchImpl: async (_url, init) => {
				sawSignal =
					init instanceof Object && 'signal' in init && init.signal instanceof AbortSignal;
				return jsonResponse({});
			},
		});
		expect(sawSignal).toBe(true);
	});
});
