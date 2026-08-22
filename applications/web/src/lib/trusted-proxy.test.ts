import { describe, expect, it } from 'bun:test';
import {
	isAddressInCidr,
	isValidCidr,
	resolveNetworkIdentity,
	type TrustedProxyConfiguration,
} from '@web/lib/trusted-proxy';

function headersOf(entries: Record<string, string>): Headers {
	return new Headers(entries);
}

const untrustedConfiguration: TrustedProxyConfiguration = {
	trustedProxyCidrs: [],
	trustedProxyHeader: undefined,
	trustedProxyHopCount: 1,
};

const trustedXffConfiguration: TrustedProxyConfiguration = {
	trustedProxyCidrs: ['10.0.0.0/8'],
	trustedProxyHeader: 'x-forwarded-for',
	trustedProxyHopCount: 1,
};

describe('isAddressInCidr', () => {
	it('matches an IPv4 address inside a /8 block', () => {
		expect(isAddressInCidr('10.1.2.3', '10.0.0.0/8')).toBe(true);
	});

	it('rejects an IPv4 address outside the block', () => {
		expect(isAddressInCidr('11.1.2.3', '10.0.0.0/8')).toBe(false);
	});

	it('matches an IPv4-mapped IPv6 address against an IPv4 CIDR', () => {
		expect(isAddressInCidr('::ffff:10.1.2.3', '10.0.0.0/8')).toBe(true);
	});

	it('matches an IPv6 address inside a CIDR block', () => {
		expect(isAddressInCidr('2001:db8::1', '2001:db8::/32')).toBe(true);
	});

	it('rejects an IPv6 address outside the block', () => {
		expect(isAddressInCidr('2001:db9::1', '2001:db8::/32')).toBe(false);
	});

	it('never matches across address families', () => {
		expect(isAddressInCidr('2001:db8::1', '10.0.0.0/8')).toBe(false);
	});
});

describe('isValidCidr', () => {
	it('accepts a valid IPv4 CIDR', () => {
		expect(isValidCidr('10.0.0.0/8')).toBe(true);
	});

	it('accepts a valid IPv6 CIDR', () => {
		expect(isValidCidr('2001:db8::/32')).toBe(true);
	});

	it('rejects a value with no prefix length', () => {
		expect(isValidCidr('10.0.0.0')).toBe(false);
	});

	it('rejects a value that is not an address at all', () => {
		expect(isValidCidr('not-a-cidr')).toBe(false);
	});

	it('rejects a prefix length that exceeds the address family width', () => {
		expect(isValidCidr('10.0.0.0/40')).toBe(false);
		expect(isValidCidr('2001:db8::/200')).toBe(false);
	});

	it('rejects a non-numeric prefix length', () => {
		expect(isValidCidr('10.0.0.0/eight')).toBe(false);
	});

	it('rejects a CIDR with more than one slash', () => {
		expect(isValidCidr('10.0.0.0/8/8')).toBe(false);
	});
});

describe('resolveNetworkIdentity', () => {
	it('uses the socket address when no trust configuration is set', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: '203.0.113.7',
			headers: headersOf({ 'x-forwarded-for': '198.51.100.9' }),
			configuration: untrustedConfiguration,
		});
		expect(identity).toBe('203.0.113.7');
	});

	it('ignores a forged x-forwarded-for header from an untrusted peer', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: '203.0.113.7',
			headers: headersOf({ 'x-forwarded-for': '198.51.100.9' }),
			configuration: trustedXffConfiguration,
		});
		expect(identity).toBe('203.0.113.7');
	});

	it('ignores a forged forwarded header from an untrusted peer', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: '203.0.113.7',
			headers: headersOf({ forwarded: 'for=198.51.100.9' }),
			configuration: { ...trustedXffConfiguration, trustedProxyHeader: 'forwarded' },
		});
		expect(identity).toBe('203.0.113.7');
	});

	it('ignores a forged cf-connecting-ip header from an untrusted peer', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: '203.0.113.7',
			headers: headersOf({ 'cf-connecting-ip': '198.51.100.9' }),
			configuration: { ...trustedXffConfiguration, trustedProxyHeader: 'cf-connecting-ip' },
		});
		expect(identity).toBe('203.0.113.7');
	});

	it('trusts the x-forwarded-for header when the peer is a trusted proxy', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: '10.0.0.5',
			headers: headersOf({ 'x-forwarded-for': '198.51.100.9' }),
			configuration: trustedXffConfiguration,
		});
		expect(identity).toBe('198.51.100.9');
	});

	it('reads the hop the trusted proxy appended, ignoring a client-forged entry ahead of it', () => {
		// "9.9.9.9" is whatever the client put in the header before ever
		// reaching our trusted proxy; "198.51.100.9" is the entry our
		// trusted proxy appended for the peer it actually observed.
		const identity = resolveNetworkIdentity({
			socketAddress: '10.0.0.5',
			headers: headersOf({ 'x-forwarded-for': '9.9.9.9, 198.51.100.9' }),
			configuration: trustedXffConfiguration,
		});
		expect(identity).toBe('198.51.100.9');
	});

	it('walks back the configured number of trusted hops', () => {
		const identityWithForgery = resolveNetworkIdentity({
			socketAddress: '10.0.0.5',
			headers: headersOf({ 'x-forwarded-for': '9.9.9.9, 198.51.100.9, 172.16.0.1' }),
			configuration: { ...trustedXffConfiguration, trustedProxyHopCount: 2 },
		});
		expect(identityWithForgery).toBe('198.51.100.9');
	});

	it('parses a for= token out of the forwarded header', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: '10.0.0.5',
			headers: headersOf({ forwarded: 'for=198.51.100.9;proto=https' }),
			configuration: { ...trustedXffConfiguration, trustedProxyHeader: 'forwarded' },
		});
		expect(identity).toBe('198.51.100.9');
	});

	it('parses a bracketed IPv6 for= token out of the forwarded header', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: '10.0.0.5',
			headers: headersOf({ forwarded: 'for="[2001:db8::1]:4711"' }),
			configuration: { ...trustedXffConfiguration, trustedProxyHeader: 'forwarded' },
		});
		expect(identity).toBe('2001:db8::1');
	});

	it('trusts cf-connecting-ip when the peer is a trusted proxy', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: '10.0.0.5',
			headers: headersOf({ 'cf-connecting-ip': '198.51.100.9' }),
			configuration: { ...trustedXffConfiguration, trustedProxyHeader: 'cf-connecting-ip' },
		});
		expect(identity).toBe('198.51.100.9');
	});

	it('falls back to the trusted socket address when the header is absent', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: '10.0.0.5',
			headers: headersOf({}),
			configuration: trustedXffConfiguration,
		});
		expect(identity).toBe('10.0.0.5');
	});

	it('resolves an IPv4-mapped IPv6 socket address to the same identity as plain IPv4', () => {
		const mapped = resolveNetworkIdentity({
			socketAddress: '::ffff:203.0.113.7',
			headers: headersOf({}),
			configuration: untrustedConfiguration,
		});
		const plain = resolveNetworkIdentity({
			socketAddress: '203.0.113.7',
			headers: headersOf({}),
			configuration: untrustedConfiguration,
		});
		expect(mapped).toBe(plain);
	});

	it('resolves alternate IPv6 spellings to the same identity', () => {
		const first = resolveNetworkIdentity({
			socketAddress: '2001:0db8:0000:0000:0000:0000:0000:0001',
			headers: headersOf({}),
			configuration: untrustedConfiguration,
		});
		const second = resolveNetworkIdentity({
			socketAddress: '2001:db8::1',
			headers: headersOf({}),
			configuration: untrustedConfiguration,
		});
		expect(first).toBe(second);
	});

	it('returns unknown-client when no socket address is available', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: undefined,
			headers: headersOf({}),
			configuration: untrustedConfiguration,
		});
		expect(identity).toBe('unknown-client');
	});

	it('falls back to the trusted socket address when the configured hop count exceeds the entries present, instead of trusting the leftmost (potentially client-forged) entry', () => {
		// Configured for 2 trusted hops, but the header the trusted proxy
		// actually forwarded only carries 1 entry — a shorter chain than
		// expected. The one remaining entry is not verified to have been
		// written by a trusted proxy, so it must not be trusted as the
		// client's real identity.
		const identity = resolveNetworkIdentity({
			socketAddress: '10.0.0.5',
			headers: headersOf({ 'x-forwarded-for': 'forged-by-client' }),
			configuration: { ...trustedXffConfiguration, trustedProxyHopCount: 2 },
		});
		expect(identity).toBe('10.0.0.5');
		expect(identity).not.toBe('forged-by-client');
	});

	it('falls back to the trusted socket address when the hop count exceeds the entries present in the forwarded header too', () => {
		const identity = resolveNetworkIdentity({
			socketAddress: '10.0.0.5',
			headers: headersOf({ forwarded: 'for=forged-by-client' }),
			configuration: {
				...trustedXffConfiguration,
				trustedProxyHeader: 'forwarded',
				trustedProxyHopCount: 2,
			},
		});
		expect(identity).toBe('10.0.0.5');
	});
});
