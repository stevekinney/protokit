import { describe, it, expect } from 'vitest';
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
});
