import { describe, expect, it } from 'bun:test';
import {
	deriveSessionCsrfToken,
	isTrustedRequestOrigin,
	isValidSessionCsrfToken,
} from '@web/lib/csrf-protection';

describe('deriveSessionCsrfToken', () => {
	it('is deterministic for the same session token', () => {
		const tokenA = deriveSessionCsrfToken('session-token-abc');
		const tokenB = deriveSessionCsrfToken('session-token-abc');
		expect(tokenA).toBe(tokenB);
	});

	it('differs across session tokens', () => {
		const tokenA = deriveSessionCsrfToken('session-token-abc');
		const tokenB = deriveSessionCsrfToken('session-token-xyz');
		expect(tokenA).not.toBe(tokenB);
	});
});

describe('isValidSessionCsrfToken', () => {
	it('accepts the correctly derived token', () => {
		const token = deriveSessionCsrfToken('session-token-abc');
		expect(isValidSessionCsrfToken('session-token-abc', token)).toBe(true);
	});

	it('rejects a token derived from a different session', () => {
		const token = deriveSessionCsrfToken('session-token-other');
		expect(isValidSessionCsrfToken('session-token-abc', token)).toBe(false);
	});

	it('rejects a missing token', () => {
		expect(isValidSessionCsrfToken('session-token-abc', null)).toBe(false);
		expect(isValidSessionCsrfToken('session-token-abc', undefined)).toBe(false);
	});

	it('rejects an empty token', () => {
		expect(isValidSessionCsrfToken('session-token-abc', '')).toBe(false);
	});

	it('rejects a tampered token of a different length', () => {
		const token = deriveSessionCsrfToken('session-token-abc');
		expect(isValidSessionCsrfToken('session-token-abc', `${token}extra`)).toBe(false);
	});
});

describe('isTrustedRequestOrigin', () => {
	const expectedOrigin = 'https://app.example.com';

	it('accepts sec-fetch-site: same-origin', () => {
		const request = new Request('https://app.example.com/auth/sign-out', {
			method: 'POST',
			headers: { 'sec-fetch-site': 'same-origin' },
		});
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(true);
	});

	it('accepts sec-fetch-site: none', () => {
		const request = new Request('https://app.example.com/auth/sign-out', {
			method: 'POST',
			headers: { 'sec-fetch-site': 'none' },
		});
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(true);
	});

	it('rejects sec-fetch-site: cross-site even when Origin matches', () => {
		const request = new Request('https://app.example.com/auth/sign-out', {
			method: 'POST',
			headers: { 'sec-fetch-site': 'cross-site', origin: expectedOrigin },
		});
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(false);
	});

	it('falls back to a matching Origin header when sec-fetch-site is absent', () => {
		const request = new Request('https://app.example.com/auth/sign-out', {
			method: 'POST',
			headers: { origin: expectedOrigin },
		});
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(true);
	});

	it('rejects a mismatched Origin header', () => {
		const request = new Request('https://app.example.com/auth/sign-out', {
			method: 'POST',
			headers: { origin: 'https://evil.example.com' },
		});
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(false);
	});

	it('fails closed when neither header is present', () => {
		const request = new Request('https://app.example.com/auth/sign-out', { method: 'POST' });
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(false);
	});
});
