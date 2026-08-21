import { describe, expect, it, beforeEach } from 'bun:test';
import {
	clearClientIdMetadataDocumentCacheForTests,
	fetchClientIdMetadataDocument,
	isClientIdMetadataDocumentUrl,
} from '@web/lib/client-metadata-documents';

const validDocumentUrl = 'https://app.example.com/oauth/client.json';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
		...init,
	});
}

/** A public-looking IPv4 address, distinct per test only where it matters. */
const publicAddress = { address: '93.184.216.34', family: 4 };

function lookupResolvingTo(...addresses: { address: string; family: number }[]) {
	return async () => addresses;
}

describe('isClientIdMetadataDocumentUrl', () => {
	it('accepts an https URL with a non-root path', () => {
		expect(isClientIdMetadataDocumentUrl(validDocumentUrl)).toBe(true);
	});

	it('rejects a bare https origin with no path', () => {
		expect(isClientIdMetadataDocumentUrl('https://app.example.com')).toBe(false);
		expect(isClientIdMetadataDocumentUrl('https://app.example.com/')).toBe(false);
	});

	it('rejects http (non-TLS)', () => {
		expect(isClientIdMetadataDocumentUrl('http://app.example.com/client.json')).toBe(false);
	});

	it('rejects a URL with a fragment', () => {
		expect(isClientIdMetadataDocumentUrl(`${validDocumentUrl}#frag`)).toBe(false);
	});

	it('rejects a URL with embedded userinfo', () => {
		expect(isClientIdMetadataDocumentUrl('https://user:pass@app.example.com/client.json')).toBe(
			false,
		);
	});

	it('rejects a DCR-shaped client_id (not a URL at all)', () => {
		expect(isClientIdMetadataDocumentUrl('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
	});

	it('rejects a malformed URL', () => {
		expect(isClientIdMetadataDocumentUrl('not a url')).toBe(false);
	});
});

describe('fetchClientIdMetadataDocument', () => {
	beforeEach(() => {
		clearClientIdMetadataDocumentCacheForTests();
	});

	const validDocumentBody = {
		client_id: validDocumentUrl,
		client_name: 'Example CIMD Client',
		redirect_uris: ['https://app.example.com/callback'],
	};

	it('returns null for a client_id that is not CIMD-shaped, without ever fetching', async () => {
		let fetchCalled = false;
		const result = await fetchClientIdMetadataDocument('not-a-url', {
			fetchImpl: async () => {
				fetchCalled = true;
				return jsonResponse(validDocumentBody);
			},
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
		expect(fetchCalled).toBe(false);
	});

	it('fetches, validates, and returns a well-formed document', async () => {
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () => jsonResponse(validDocumentBody),
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).not.toBeNull();
		expect(result?.clientId).toBe(validDocumentUrl);
		expect(result?.clientName).toBe('Example CIMD Client');
		expect(result?.redirectUris).toEqual(['https://app.example.com/callback']);
		// Defaults applied like DCR: `none` is the only auth method a CIMD
		// document can declare, and both defaults match the DCR schema.
		expect(result?.grantTypes).toEqual(['authorization_code', 'refresh_token']);
		expect(result?.responseTypes).toEqual(['code']);
	});

	it('rejects a document whose client_id does not match the fetch URL exactly', async () => {
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () =>
				jsonResponse({ ...validDocumentBody, client_id: 'https://attacker.example.com/x.json' }),
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
	});

	it('rejects a document missing required fields', async () => {
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () => jsonResponse({ client_id: validDocumentUrl }),
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
	});

	it('rejects a document declaring an auth method other than none', async () => {
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () =>
				jsonResponse({ ...validDocumentBody, token_endpoint_auth_method: 'client_secret_post' }),
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
	});

	it('rejects application_type "web" combined with a loopback redirect_uri', async () => {
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () =>
				jsonResponse({
					...validDocumentBody,
					redirect_uris: ['http://localhost:3000/callback'],
					application_type: 'web',
				}),
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
	});

	it('accepts application_type "native" with a loopback redirect_uri', async () => {
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () =>
				jsonResponse({
					...validDocumentBody,
					redirect_uris: ['http://localhost:3000/callback'],
					application_type: 'native',
				}),
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).not.toBeNull();
		expect(result?.applicationType).toBe('native');
	});

	it('rejects malformed JSON', async () => {
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () =>
				new Response('not json{{{', {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
	});

	it('rejects a non-application/json content type', async () => {
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () =>
				new Response(JSON.stringify(validDocumentBody), {
					status: 200,
					headers: { 'content-type': 'text/plain' },
				}),
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
	});

	it('rejects a non-2xx response', async () => {
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () => new Response('nope', { status: 404 }),
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
	});

	it('rejects a response over the byte limit even when Content-Length lies', async () => {
		const oversizedBody = JSON.stringify({
			...validDocumentBody,
			client_name: 'x'.repeat(64 * 1024),
		});
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () =>
				new Response(oversizedBody, {
					status: 200,
					headers: { 'content-type': 'application/json', 'content-length': '1' },
				}),
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
	});

	it('rejects a declared Content-Length over the byte limit before reading the body', async () => {
		let bodyRead = false;
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () => {
				const response = new Response(JSON.stringify(validDocumentBody), {
					status: 200,
					headers: { 'content-type': 'application/json', 'content-length': '999999' },
				});
				const originalGetReader = response.body!.getReader.bind(response.body);
				(response.body as unknown as { getReader: () => unknown }).getReader = () => {
					bodyRead = true;
					return originalGetReader();
				};
				return response;
			},
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
		expect(bodyRead).toBe(false);
	});

	it('propagates a fetch-level failure (network error, timeout) as null', async () => {
		const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
			fetchImpl: async () => {
				throw new Error('network unreachable');
			},
			lookupImpl: lookupResolvingTo(publicAddress),
		});
		expect(result).toBeNull();
	});

	it('caches a successful result and does not fetch again within the TTL', async () => {
		let fetchCount = 0;
		let currentTime = 1_000_000;
		const dependencies = {
			fetchImpl: async () => {
				fetchCount += 1;
				return jsonResponse(validDocumentBody);
			},
			lookupImpl: lookupResolvingTo(publicAddress),
			now: () => currentTime,
		};

		const first = await fetchClientIdMetadataDocument(validDocumentUrl, dependencies);
		expect(first).not.toBeNull();
		expect(fetchCount).toBe(1);

		const second = await fetchClientIdMetadataDocument(validDocumentUrl, dependencies);
		expect(second).not.toBeNull();
		expect(fetchCount).toBe(1);

		currentTime += 60 * 60 * 1000; // well past the cache TTL
		const third = await fetchClientIdMetadataDocument(validDocumentUrl, dependencies);
		expect(third).not.toBeNull();
		expect(fetchCount).toBe(2);
	});

	describe('SSRF protections', () => {
		it('rejects a client_id URL whose hostname is a literal loopback address', async () => {
			let fetchCalled = false;
			const result = await fetchClientIdMetadataDocument('https://127.0.0.1/client.json', {
				fetchImpl: async () => {
					fetchCalled = true;
					return jsonResponse(validDocumentBody);
				},
				lookupImpl: lookupResolvingTo(publicAddress),
			});
			expect(result).toBeNull();
			expect(fetchCalled).toBe(false);
		});

		it('rejects a client_id URL whose hostname is a literal cloud-metadata address', async () => {
			const result = await fetchClientIdMetadataDocument('https://169.254.169.254/client.json', {
				fetchImpl: async () => jsonResponse(validDocumentBody),
				lookupImpl: lookupResolvingTo(publicAddress),
			});
			expect(result).toBeNull();
		});

		it('rejects a client_id URL whose hostname is a literal RFC 1918 private address', async () => {
			const result = await fetchClientIdMetadataDocument('https://10.0.0.5/client.json', {
				fetchImpl: async () => jsonResponse(validDocumentBody),
				lookupImpl: lookupResolvingTo(publicAddress),
			});
			expect(result).toBeNull();
		});

		it('rejects a public-looking hostname that resolves (DNS rebinding) to a private address', async () => {
			let fetchCalled = false;
			const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
				fetchImpl: async () => {
					fetchCalled = true;
					return jsonResponse(validDocumentBody);
				},
				lookupImpl: lookupResolvingTo({ address: '192.168.1.5', family: 4 }),
			});
			expect(result).toBeNull();
			expect(fetchCalled).toBe(false);
		});

		it('rejects a hostname when ANY resolved address is private, even if another is public', async () => {
			const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
				fetchImpl: async () => jsonResponse(validDocumentBody),
				lookupImpl: lookupResolvingTo(publicAddress, { address: '127.0.0.1', family: 4 }),
			});
			expect(result).toBeNull();
		});

		it('rejects an IPv6 loopback/link-local literal', async () => {
			const loopback = await fetchClientIdMetadataDocument('https://[::1]/client.json', {
				fetchImpl: async () => jsonResponse(validDocumentBody),
				lookupImpl: lookupResolvingTo(publicAddress),
			});
			expect(loopback).toBeNull();

			const linkLocal = await fetchClientIdMetadataDocument('https://[fe80::1]/client.json', {
				fetchImpl: async () => jsonResponse(validDocumentBody),
				lookupImpl: lookupResolvingTo(publicAddress),
			});
			expect(linkLocal).toBeNull();
		});

		it('rejects when DNS resolution fails outright', async () => {
			const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
				fetchImpl: async () => jsonResponse(validDocumentBody),
				lookupImpl: async () => {
					throw new Error('ENOTFOUND');
				},
			});
			expect(result).toBeNull();
		});

		it('passes redirect: "error" to fetch so a redirect to an internal target cannot be followed', async () => {
			let observedRedirectMode: string | undefined;
			const result = await fetchClientIdMetadataDocument(validDocumentUrl, {
				fetchImpl: async (_input, init) => {
					observedRedirectMode = (init as RequestInit | undefined)?.redirect;
					return jsonResponse(validDocumentBody);
				},
				lookupImpl: lookupResolvingTo(publicAddress),
			});
			expect(result).not.toBeNull();
			expect(observedRedirectMode).toBe('error');
		});
	});
});
