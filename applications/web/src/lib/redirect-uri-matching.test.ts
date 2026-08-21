import { describe, it, expect } from 'bun:test';
import { redirectUriMatchesRegistered } from './redirect-uri-matching';
import { isValidRedirectUri } from './validate-redirect-uri';

describe('redirectUriMatchesRegistered', () => {
	it('matches an exact HTTPS redirect URI', () => {
		expect(
			redirectUriMatchesRegistered(
				'https://example.com/cb',
				['https://example.com/cb'],
				isValidRedirectUri,
			),
		).toBe(true);
	});

	it('rejects an HTTPS redirect URI with a different port than registered', () => {
		expect(
			redirectUriMatchesRegistered(
				'https://example.com:8443/cb',
				['https://example.com/cb'],
				isValidRedirectUri,
			),
		).toBe(false);
	});

	it('rejects an HTTPS lookalike host (subdomain suffix trick)', () => {
		expect(
			redirectUriMatchesRegistered(
				'https://claude.ai.evil.com/api/mcp/auth_callback',
				['https://claude.ai/api/mcp/auth_callback'],
				isValidRedirectUri,
			),
		).toBe(false);
	});

	it('rejects an HTTPS path suffix variant', () => {
		expect(
			redirectUriMatchesRegistered(
				'https://claude.ai/api/mcp/auth_callback/extra',
				['https://claude.ai/api/mcp/auth_callback'],
				isValidRedirectUri,
			),
		).toBe(false);
	});

	it('matches a registered loopback redirect URI whose request uses a different port', () => {
		expect(
			redirectUriMatchesRegistered(
				'http://127.0.0.1:54321/callback',
				['http://127.0.0.1:1234/callback'],
				isValidRedirectUri,
			),
		).toBe(true);
	});

	it('matches a registered loopback redirect URI with no port against a request with a port', () => {
		expect(
			redirectUriMatchesRegistered(
				'http://localhost:9999/callback',
				['http://localhost/callback'],
				isValidRedirectUri,
			),
		).toBe(true);
	});

	it('does not treat localhost and 127.0.0.1 as the same loopback host', () => {
		expect(
			redirectUriMatchesRegistered(
				'http://127.0.0.1:9999/callback',
				['http://localhost/callback'],
				isValidRedirectUri,
			),
		).toBe(false);
	});

	it('rejects a loopback request whose path differs from every registered entry', () => {
		expect(
			redirectUriMatchesRegistered(
				'http://localhost:9999/other',
				['http://localhost/callback'],
				isValidRedirectUri,
			),
		).toBe(false);
	});

	it('rejects a port-varying loopback request carrying a fragment, even though scheme/host/path/query match', () => {
		expect(
			redirectUriMatchesRegistered(
				'http://127.0.0.1:9999/cb#frag',
				['http://127.0.0.1/cb'],
				isValidRedirectUri,
			),
		).toBe(false);
	});

	it('rejects a port-varying loopback request carrying embedded userinfo', () => {
		expect(
			redirectUriMatchesRegistered(
				'http://user:pass@127.0.0.1:9999/cb',
				['http://127.0.0.1/cb'],
				isValidRedirectUri,
			),
		).toBe(false);
	});

	it('never applies port flexibility to a non-loopback http/https request', () => {
		expect(
			redirectUriMatchesRegistered(
				'https://example.com:9999/cb',
				['https://example.com/cb'],
				isValidRedirectUri,
			),
		).toBe(false);
	});

	it('rejects when the client has no matching registered redirect URI at all', () => {
		expect(redirectUriMatchesRegistered('http://localhost:9999/cb', [], isValidRedirectUri)).toBe(
			false,
		);
	});

	it('rejects a malformed requested URI', () => {
		expect(
			redirectUriMatchesRegistered('not-a-url', ['http://localhost/callback'], isValidRedirectUri),
		).toBe(false);
	});
});
