import { describe, expect, it } from 'bun:test';
import { applySecurityHeaders } from '@web/application';

/**
 * SEC-005 / S-17: direct unit coverage of `applySecurityHeaders`, the pure
 * function backing every response this server sends. Named by
 * `test:browser-security` — the roadmap's acceptance criterion 5 asks for
 * HSTS in production, no-referrer on sensitive pages, CSP, framing,
 * content-sniffing, Permissions Policy, and cookie attributes; the cookie
 * attributes are covered by `session-authentication.test.ts` instead, since
 * they are produced by `serializeCookie`/`getSessionCookieName`, not this
 * function.
 */

function jsonResponseFixture(): Response {
	return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
}

function htmlResponseFixture(): Response {
	return new Response('<html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

describe('applySecurityHeaders', () => {
	it('sets X-Content-Type-Options: nosniff on every response', () => {
		const response = applySecurityHeaders(jsonResponseFixture(), '/', { isProduction: false });
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('sets a restrictive Permissions-Policy on every response', () => {
		const response = applySecurityHeaders(jsonResponseFixture(), '/', { isProduction: false });
		const policy = response.headers.get('Permissions-Policy')!;
		expect(policy).toContain('camera=()');
		expect(policy).toContain('microphone=()');
		expect(policy).toContain('geolocation=()');
	});

	it('sets Strict-Transport-Security only in production', () => {
		const productionResponse = applySecurityHeaders(jsonResponseFixture(), '/', {
			isProduction: true,
		});
		expect(productionResponse.headers.get('Strict-Transport-Security')).toContain('max-age=');

		const developmentResponse = applySecurityHeaders(jsonResponseFixture(), '/', {
			isProduction: false,
		});
		expect(developmentResponse.headers.get('Strict-Transport-Security')).toBeNull();
	});

	it('uses no-referrer on the OAuth authorize page', () => {
		const response = applySecurityHeaders(htmlResponseFixture(), '/oauth/authorize', {
			isProduction: false,
		});
		expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
	});

	it('uses no-referrer on the Google sign-in start and callback pages', () => {
		const startResponse = applySecurityHeaders(htmlResponseFixture(), '/auth/google/start', {
			isProduction: false,
		});
		expect(startResponse.headers.get('Referrer-Policy')).toBe('no-referrer');

		const callbackResponse = applySecurityHeaders(htmlResponseFixture(), '/auth/google/callback', {
			isProduction: false,
		});
		expect(callbackResponse.headers.get('Referrer-Policy')).toBe('no-referrer');
	});

	it('uses strict-origin-when-cross-origin elsewhere', () => {
		const response = applySecurityHeaders(htmlResponseFixture(), '/', { isProduction: false });
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
	});

	it('sets X-Frame-Options: DENY on the OAuth authorize page', () => {
		const response = applySecurityHeaders(htmlResponseFixture(), '/oauth/authorize', {
			isProduction: false,
		});
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
	});

	it('sets a Content-Security-Policy with frame-ancestors none on every HTML response', () => {
		const response = applySecurityHeaders(htmlResponseFixture(), '/', { isProduction: false });
		const csp = response.headers.get('Content-Security-Policy')!;
		expect(csp).toContain("frame-ancestors 'none'");
	});

	it('never sets Content-Security-Policy on a JSON response', () => {
		const response = applySecurityHeaders(jsonResponseFixture(), '/', { isProduction: false });
		expect(response.headers.get('Content-Security-Policy')).toBeNull();
	});

	it('sets no-store, private cache headers and Vary: Cookie on every HTML response', () => {
		const response = applySecurityHeaders(htmlResponseFixture(), '/', { isProduction: false });
		expect(response.headers.get('Cache-Control')).toBe('no-store, private');
		expect(response.headers.get('Pragma')).toBe('no-cache');
		expect(response.headers.get('Vary')).toBe('Cookie');
	});

	it('sets no-store cache headers on the OAuth authorize consent page too', () => {
		const response = applySecurityHeaders(htmlResponseFixture(), '/oauth/authorize', {
			isProduction: false,
		});
		expect(response.headers.get('Cache-Control')).toBe('no-store, private');
	});

	it('does not overwrite an explicit Cache-Control a route already set (e.g. an immutable static asset)', () => {
		const response = new Response('body', {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'public, max-age=31536000, immutable',
			},
		});
		const result = applySecurityHeaders(response, '/', { isProduction: false });
		expect(result.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
	});

	it('never sets Cache-Control on a JSON response (routes own their own no-store headers)', () => {
		const response = applySecurityHeaders(jsonResponseFixture(), '/', { isProduction: false });
		expect(response.headers.get('Cache-Control')).toBeNull();
	});
});
