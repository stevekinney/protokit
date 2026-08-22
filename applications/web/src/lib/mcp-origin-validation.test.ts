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
