import { describe, expect, it } from 'bun:test';
import {
	createMcpCorsHeaders,
	parseAllowedOrigins,
	validateMcpRequestOrigin,
} from '@web/lib/mcp-origin-validation';

function requestWithOrigin(origin: string | undefined): Request {
	const headers = new Headers();
	if (origin !== undefined) {
		headers.set('origin', origin);
	}
	return new Request('http://localhost:3000/mcp', { method: 'POST', headers });
}

describe('parseAllowedOrigins', () => {
	it('defaults to http://localhost:3000 when unset', () => {
		expect(parseAllowedOrigins(undefined)).toEqual(new Set(['http://localhost:3000']));
	});

	it('splits a comma-separated list and trims whitespace', () => {
		expect(parseAllowedOrigins(' https://a.example, https://b.example ,,')).toEqual(
			new Set(['https://a.example', 'https://b.example']),
		);
	});

	it('canonicalizes a trailing slash so a browser-address-bar copy-paste still matches (round-14 review)', () => {
		expect(parseAllowedOrigins('https://claude.ai/')).toEqual(new Set(['https://claude.ai']));
	});

	it('drops the trailing-slash form and the canonical form to the same single entry when both are configured', () => {
		expect(parseAllowedOrigins('https://claude.ai/,https://claude.ai')).toEqual(
			new Set(['https://claude.ai']),
		);
	});

	it('lowercases the scheme and host, matching the canonical form a real Origin header always uses', () => {
		expect(parseAllowedOrigins('HTTPS://Claude.AI')).toEqual(new Set(['https://claude.ai']));
	});

	it('preserves a non-default port', () => {
		expect(parseAllowedOrigins('http://localhost:5173/')).toEqual(
			new Set(['http://localhost:5173']),
		);
	});

	it('drops an entry carrying a real path -- an Origin header can never contain one', () => {
		expect(parseAllowedOrigins('https://claude.ai/callback')).toEqual(new Set());
	});

	it('drops an entry carrying a query string', () => {
		expect(parseAllowedOrigins('https://claude.ai?x=1')).toEqual(new Set());
	});

	it('drops an entry carrying a fragment', () => {
		expect(parseAllowedOrigins('https://claude.ai#section')).toEqual(new Set());
	});

	it('drops an entry carrying embedded userinfo', () => {
		expect(parseAllowedOrigins('https://user:pass@claude.ai')).toEqual(new Set());
	});

	it('drops an entry using a non-http(s) scheme', () => {
		expect(parseAllowedOrigins('ftp://claude.ai')).toEqual(new Set());
	});

	it('drops an entry that is not a parseable URL at all', () => {
		expect(parseAllowedOrigins('not a url')).toEqual(new Set());
	});

	it('keeps every other well-formed entry when one entry in the list is malformed', () => {
		expect(parseAllowedOrigins('https://claude.ai/callback,https://a.example')).toEqual(
			new Set(['https://a.example']),
		);
	});
});

describe('validateMcpRequestOrigin with a trailing-slash configured origin (round-14 review)', () => {
	it('allows a real browser request whose Origin header has no trailing slash, even though the operator configured one', () => {
		const allowedOrigins = parseAllowedOrigins('https://claude.ai/');
		expect(
			validateMcpRequestOrigin(requestWithOrigin('https://claude.ai'), allowedOrigins),
		).toEqual({ allowed: true });
	});
});

describe('validateMcpRequestOrigin (SEC-002 cross-site boundary)', () => {
	const allowedOrigins = parseAllowedOrigins('http://localhost:3000,https://claude.ai');

	it('allows a request with no Origin header (non-browser clients)', () => {
		expect(validateMcpRequestOrigin(requestWithOrigin(undefined), allowedOrigins)).toEqual({
			allowed: true,
		});
	});

	it('allows an origin on the allow-list', () => {
		expect(
			validateMcpRequestOrigin(requestWithOrigin('https://claude.ai'), allowedOrigins),
		).toEqual({ allowed: true });
	});

	it('rejects a cross-site origin not on the allow-list', () => {
		expect(
			validateMcpRequestOrigin(requestWithOrigin('https://evil.example'), allowedOrigins),
		).toEqual({ allowed: false });
	});

	it('rejects a sandboxed/null origin', () => {
		expect(validateMcpRequestOrigin(requestWithOrigin('null'), allowedOrigins)).toEqual({
			allowed: false,
		});
	});

	it('is case-sensitive and scheme-sensitive (http vs https on the same host is a different origin)', () => {
		expect(validateMcpRequestOrigin(requestWithOrigin('http://claude.ai'), allowedOrigins)).toEqual(
			{ allowed: false },
		);
	});

	it('rejects every origin when the allow-list is empty', () => {
		expect(validateMcpRequestOrigin(requestWithOrigin('http://localhost:3000'), new Set())).toEqual(
			{ allowed: false },
		);
	});
});

describe('createMcpCorsHeaders', () => {
	const allowedOrigins = parseAllowedOrigins('https://claude.ai');

	it('returns no CORS headers for a disallowed origin', () => {
		expect(createMcpCorsHeaders(requestWithOrigin('https://evil.example'), allowedOrigins)).toEqual(
			{},
		);
	});

	it('returns no CORS headers when Origin is absent', () => {
		expect(createMcpCorsHeaders(requestWithOrigin(undefined), allowedOrigins)).toEqual({});
	});

	it('echoes an allowed origin with Vary: Origin so caches never leak across origins', () => {
		const headers = createMcpCorsHeaders(requestWithOrigin('https://claude.ai'), allowedOrigins);
		expect(headers['Access-Control-Allow-Origin']).toBe('https://claude.ai');
		expect(headers.Vary).toBe('Origin');
	});
});
