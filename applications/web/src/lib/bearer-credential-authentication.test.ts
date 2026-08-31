import { describe, expect, it } from 'bun:test';
import {
	checkBearerCredential,
	isPlaintextTransport,
} from '@web/lib/bearer-credential-authentication';
import type { TrustedProxyConfiguration } from '@lostgradient/mcp/oauth';

describe('checkBearerCredential', () => {
	it('accepts a credential separated by more than one space', () => {
		// Round 17 review finding: RFC 9110 §11.1 allows `1*SP` between the
		// scheme and the credential, but slicing at the first space left the
		// surplus spaces attached to the presented value, so `/metrics` and
		// `/health/ready` rejected a compliant operator request.
		expect(
			checkBearerCredential({
				configuredKey: 'operator-key',
				authorizationHeader: 'Bearer   operator-key',
			}),
		).toBe('authorized');
	});

	it('still rejects a credential whose own trailing whitespace differs', () => {
		// Only the separator run is skipped; the credential is never trimmed,
		// so a value nobody actually configured cannot be coerced into a match.
		expect(
			checkBearerCredential({
				configuredKey: 'operator-key',
				authorizationHeader: 'Bearer operator-key ',
			}),
		).toBe('unauthorized');
	});
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

	// Round 10 review finding: RFC 7235 §2.1 makes the HTTP auth scheme name
	// case-insensitive. A standards-compliant client sending `bearer` (or any
	// other casing) must still authenticate.
	it('returns authorized when the scheme is lowercase ("bearer")', () => {
		expect(
			checkBearerCredential({ configuredKey: 'secret', authorizationHeader: 'bearer secret' }),
		).toBe('authorized');
	});

	it('returns authorized when the scheme is uppercase ("BEARER")', () => {
		expect(
			checkBearerCredential({ configuredKey: 'secret', authorizationHeader: 'BEARER secret' }),
		).toBe('authorized');
	});

	it('returns authorized when the scheme is mixed-case ("BeArEr")', () => {
		expect(
			checkBearerCredential({ configuredKey: 'secret', authorizationHeader: 'BeArEr secret' }),
		).toBe('authorized');
	});

	it('does not lowercase the credential itself -- only the scheme is case-insensitive', () => {
		expect(
			checkBearerCredential({ configuredKey: 'SeCrEt', authorizationHeader: 'bearer SeCrEt' }),
		).toBe('authorized');
		expect(
			checkBearerCredential({ configuredKey: 'SeCrEt', authorizationHeader: 'bearer secret' }),
		).toBe('unauthorized');
	});

	it('still returns unauthorized for a non-bearer scheme regardless of case', () => {
		expect(
			checkBearerCredential({ configuredKey: 'secret', authorizationHeader: 'basic secret' }),
		).toBe('unauthorized');
	});
});

describe('isPlaintextTransport', () => {
	const noTrustedProxies: TrustedProxyConfiguration = {
		trustedProxyCidrs: [],
		trustedProxyHeader: undefined,
		trustedProxyHopCount: 1,
	};

	/** A configuration matching real production (`CONFIG-001` requires this to be set). */
	const trustedReverseProxy: TrustedProxyConfiguration = {
		trustedProxyCidrs: ['10.0.0.0/8'],
		trustedProxyHeader: 'x-forwarded-for',
		trustedProxyHopCount: 1,
	};

	it('is never plaintext outside production', () => {
		const request = new Request('http://example.com/metrics');
		expect(
			isPlaintextTransport({
				request,
				isProduction: false,
				socketAddress: undefined,
				trustedProxyConfiguration: noTrustedProxies,
			}),
		).toBe(false);
	});

	it('is plaintext in production when there is no forwarded-proto header and the URL is http', () => {
		const request = new Request('http://example.com/metrics');
		expect(
			isPlaintextTransport({
				request,
				isProduction: true,
				socketAddress: undefined,
				trustedProxyConfiguration: noTrustedProxies,
			}),
		).toBe(true);
	});

	it('is not plaintext in production when the URL itself is https', () => {
		const request = new Request('https://example.com/metrics');
		expect(
			isPlaintextTransport({
				request,
				isProduction: true,
				socketAddress: undefined,
				trustedProxyConfiguration: noTrustedProxies,
			}),
		).toBe(false);
	});

	it('trusts an https forwarded-proto header from a configured trusted proxy peer', () => {
		const request = new Request('http://example.com/metrics', {
			headers: { 'x-forwarded-proto': 'https' },
		});
		expect(
			isPlaintextTransport({
				request,
				isProduction: true,
				socketAddress: '10.1.2.3',
				trustedProxyConfiguration: trustedReverseProxy,
			}),
		).toBe(false);
	});

	it('is plaintext in production when a trusted proxy explicitly forwards http', () => {
		const request = new Request('https://example.com/metrics', {
			headers: { 'x-forwarded-proto': 'http' },
		});
		expect(
			isPlaintextTransport({
				request,
				isProduction: true,
				socketAddress: '10.1.2.3',
				trustedProxyConfiguration: trustedReverseProxy,
			}),
		).toBe(true);
	});

	/**
	 * A P2 review finding (and a reversal of an earlier round's dismissal
	 * of the same finding, see the doc comment on `isPlaintextTransport`):
	 * a caller that is NOT a configured trusted proxy cannot spoof
	 * `X-Forwarded-Proto: https` to make a genuinely plaintext connection
	 * to this origin report as secure. This is the exact "direct-origin or
	 * proxy-misconfiguration scenario" the review named -- an attacker (or
	 * an on-path TLS-downgrade) reaching this server directly over HTTP,
	 * whose immediate socket peer is therefore never inside
	 * `TRUSTED_PROXY_CIDRS`.
	 */
	it('does not trust a forwarded-proto header from a socket peer outside the trusted CIDRs', () => {
		const request = new Request('http://example.com/metrics', {
			headers: { 'x-forwarded-proto': 'https' },
		});
		expect(
			isPlaintextTransport({
				request,
				isProduction: true,
				socketAddress: '203.0.113.7',
				trustedProxyConfiguration: trustedReverseProxy,
			}),
		).toBe(true);
	});

	it('does not trust a forwarded-proto header when no trusted proxy is configured at all', () => {
		const request = new Request('http://example.com/metrics', {
			headers: { 'x-forwarded-proto': 'https' },
		});
		expect(
			isPlaintextTransport({
				request,
				isProduction: true,
				socketAddress: '10.1.2.3',
				trustedProxyConfiguration: noTrustedProxies,
			}),
		).toBe(true);
	});

	it('does not trust a forwarded-proto header when the socket address is unknown', () => {
		const request = new Request('http://example.com/metrics', {
			headers: { 'x-forwarded-proto': 'https' },
		});
		expect(
			isPlaintextTransport({
				request,
				isProduction: true,
				socketAddress: undefined,
				trustedProxyConfiguration: trustedReverseProxy,
			}),
		).toBe(true);
	});
});
