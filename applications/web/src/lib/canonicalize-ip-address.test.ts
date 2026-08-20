import { describe, expect, it } from 'bun:test';
import { canonicalizeIpAddress, stripPort } from '@web/lib/canonicalize-ip-address';

describe('canonicalizeIpAddress', () => {
	it('returns an IPv4 address unchanged', () => {
		expect(canonicalizeIpAddress('203.0.113.7')).toBe('203.0.113.7');
	});

	it('collapses an IPv4-mapped IPv6 address to plain IPv4', () => {
		expect(canonicalizeIpAddress('::ffff:203.0.113.7')).toBe('203.0.113.7');
	});

	it('collapses the hex form of an IPv4-mapped IPv6 address to plain IPv4', () => {
		expect(canonicalizeIpAddress('::ffff:cb00:7107')).toBe('203.0.113.7');
	});

	it('compresses an alternate IPv6 spelling to its canonical form', () => {
		expect(canonicalizeIpAddress('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
	});

	it('treats different IPv6 spellings of the same address as identical', () => {
		const expanded = canonicalizeIpAddress('2001:db8:0:0:0:0:0:1');
		const compressed = canonicalizeIpAddress('2001:db8::1');
		expect(expanded).toBe(compressed);
	});

	it('lowercases IPv6 hex digits', () => {
		expect(canonicalizeIpAddress('2001:DB8::FF00:42:8329')).toBe('2001:db8::ff00:42:8329');
	});

	it('strips an IPv6 zone id before canonicalizing', () => {
		expect(canonicalizeIpAddress('fe80::1%eth0')).toBe('fe80::1');
	});

	it('strips a trailing port from an IPv4 address', () => {
		expect(canonicalizeIpAddress('203.0.113.7:5678')).toBe('203.0.113.7');
	});

	it('strips a trailing port from a bracketed IPv6 address', () => {
		expect(canonicalizeIpAddress('[2001:db8::1]:4711')).toBe('2001:db8::1');
	});

	it('returns the loopback address unchanged', () => {
		expect(canonicalizeIpAddress('::1')).toBe('::1');
	});

	it('returns an unrecognized value trimmed and lowercased', () => {
		expect(canonicalizeIpAddress(' Unknown-Client ')).toBe('unknown-client');
	});
});

describe('stripPort', () => {
	it('leaves a bare IPv4 address unchanged', () => {
		expect(stripPort('203.0.113.7')).toBe('203.0.113.7');
	});

	it('removes the port from an IPv4:port pair', () => {
		expect(stripPort('203.0.113.7:5678')).toBe('203.0.113.7');
	});

	it('removes brackets and port from a bracketed IPv6:port pair', () => {
		expect(stripPort('[2001:db8::1]:4711')).toBe('2001:db8::1');
	});

	it('removes only brackets from a bracketed IPv6 address with no port', () => {
		expect(stripPort('[2001:db8::1]')).toBe('2001:db8::1');
	});

	it('leaves a bare IPv6 address unchanged', () => {
		expect(stripPort('2001:db8::1')).toBe('2001:db8::1');
	});
});
