import { describe, it, expect } from 'bun:test';
import { isValidRedirectUri } from './validate-redirect-uri';

describe('isValidRedirectUri', () => {
	it('accepts HTTPS URIs', () => {
		expect(isValidRedirectUri('https://example.com/callback')).toBe(true);
	});

	it('accepts http://localhost with port', () => {
		expect(isValidRedirectUri('http://localhost:3000/callback')).toBe(true);
	});

	it('accepts http://localhost without port', () => {
		expect(isValidRedirectUri('http://localhost/callback')).toBe(true);
	});

	it('accepts http://127.0.0.1', () => {
		expect(isValidRedirectUri('http://127.0.0.1:8080/callback')).toBe(true);
	});

	it('rejects http://localhost.evil.com', () => {
		expect(isValidRedirectUri('http://localhost.evil.com')).toBe(false);
	});

	it('rejects plain HTTP on non-localhost', () => {
		expect(isValidRedirectUri('http://example.com')).toBe(false);
	});

	it('rejects javascript: URIs', () => {
		expect(isValidRedirectUri('javascript:alert(1)')).toBe(false);
	});

	it('rejects empty string', () => {
		expect(isValidRedirectUri('')).toBe(false);
	});

	it('rejects a redirect URI carrying a fragment', () => {
		expect(isValidRedirectUri('https://example.com/callback#fragment')).toBe(false);
	});

	it('rejects embedded userinfo used to spoof the authority', () => {
		expect(isValidRedirectUri('https://trusted.example.com@evil.com/callback')).toBe(false);
	});

	it('rejects a password-only userinfo form', () => {
		expect(isValidRedirectUri('https://:secret@evil.com/callback')).toBe(false);
	});

	it('rejects a wildcard host', () => {
		expect(isValidRedirectUri('https://*.example.com/callback')).toBe(false);
	});

	it('rejects a wildcard embedded in a subdomain label', () => {
		expect(isValidRedirectUri('https://evil.*.example.com/callback')).toBe(false);
	});
});
