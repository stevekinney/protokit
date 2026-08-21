import { describe, expect, it } from 'bun:test';
import {
	checkBearerCredential,
	isPlaintextTransport,
} from '@web/lib/bearer-credential-authentication';

describe('checkBearerCredential', () => {
	it('returns not_configured when no key is set', () => {
		expect(
			checkBearerCredential({ configuredKey: undefined, authorizationHeader: 'Bearer anything' }),
		).toBe('not_configured');
	});

	it('returns unauthorized when no authorization header is presented', () => {
		expect(checkBearerCredential({ configuredKey: 'secret', authorizationHeader: null })).toBe(
			'unauthorized',
		);
	});

	it('returns unauthorized when the header is not a bearer token', () => {
		expect(
			checkBearerCredential({ configuredKey: 'secret', authorizationHeader: 'Basic dXNlcjpwYXNz' }),
		).toBe('unauthorized');
	});

	it('returns unauthorized when the presented token does not match', () => {
		expect(
			checkBearerCredential({ configuredKey: 'secret', authorizationHeader: 'Bearer wrong' }),
		).toBe('unauthorized');
	});

	it('returns unauthorized when the presented token has a different length', () => {
		expect(
			checkBearerCredential({
				configuredKey: 'secret',
				authorizationHeader: 'Bearer much-longer-wrong-value',
			}),
		).toBe('unauthorized');
	});

	it('returns authorized when the presented token matches exactly', () => {
		expect(
			checkBearerCredential({ configuredKey: 'secret', authorizationHeader: 'Bearer secret' }),
		).toBe('authorized');
	});
});

describe('isPlaintextTransport', () => {
	it('is never plaintext outside production', () => {
		const request = new Request('http://example.com/metrics');
		expect(isPlaintextTransport({ request, isProduction: false })).toBe(false);
	});

	it('is plaintext in production when there is no forwarded-proto header and the URL is http', () => {
		const request = new Request('http://example.com/metrics');
		expect(isPlaintextTransport({ request, isProduction: true })).toBe(true);
	});

	it('is not plaintext in production when the URL itself is https', () => {
		const request = new Request('https://example.com/metrics');
		expect(isPlaintextTransport({ request, isProduction: true })).toBe(false);
	});

	it('trusts an https forwarded-proto header even when the raw URL is http', () => {
		const request = new Request('http://example.com/metrics', {
			headers: { 'x-forwarded-proto': 'https' },
		});
		expect(isPlaintextTransport({ request, isProduction: true })).toBe(false);
	});

	it('is plaintext in production when forwarded-proto is explicitly http', () => {
		const request = new Request('https://example.com/metrics', {
			headers: { 'x-forwarded-proto': 'http' },
		});
		expect(isPlaintextTransport({ request, isProduction: true })).toBe(true);
	});
});
