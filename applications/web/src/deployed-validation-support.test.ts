import { describe, expect, it } from 'bun:test';
import {
	checkDiscoveryDocumentIsHealthy,
	checkNoCrossHostRedirect,
	checkPublicDnsResolution,
	detectStreamBuffering,
	isPubliclyRoutableIpv4,
	isPubliclyRoutableIpv6,
} from '@web/deployed-validation-support';

describe('isPubliclyRoutableIpv4', () => {
	it('accepts a genuinely public address', () => {
		expect(isPubliclyRoutableIpv4('93.184.216.34')).toBe(true);
	});

	it('rejects loopback, private, link-local, and CGNAT addresses', () => {
		expect(isPubliclyRoutableIpv4('127.0.0.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('10.0.0.5')).toBe(false);
		expect(isPubliclyRoutableIpv4('192.168.1.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('172.16.0.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('169.254.1.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('100.64.0.1')).toBe(false);
	});

	it('rejects a non-IPv4 string outright', () => {
		expect(isPubliclyRoutableIpv4('not-an-ip')).toBe(false);
	});

	// Round 13 review finding (P2): the denylist omitted the documentation
	// (TEST-NET-1/2/3), IETF protocol assignment, 6to4 relay anycast, and
	// multicast ranges present in the more complete SSRF blocklist this
	// server already maintains for CIMD fetches
	// (`client-metadata-documents.ts`'s `blockedIpCidrs`), so a deployment
	// hostname resolving only to one of these addresses was reported as
	// publicly routable -- an address no real external client can actually
	// reach.
	it('rejects documentation, IETF protocol assignment, 6to4 relay, and multicast ranges', () => {
		expect(isPubliclyRoutableIpv4('192.0.0.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('192.0.2.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('192.88.99.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('198.51.100.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('203.0.113.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('224.0.0.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('240.0.0.1')).toBe(false);
		expect(isPubliclyRoutableIpv4('255.255.255.255')).toBe(false);
	});
});

describe('isPubliclyRoutableIpv6', () => {
	it('accepts a genuinely public address', () => {
		expect(isPubliclyRoutableIpv6('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
	});

	it('rejects loopback and unique-local addresses', () => {
		expect(isPubliclyRoutableIpv6('::1')).toBe(false);
		expect(isPubliclyRoutableIpv6('fd00::1')).toBe(false);
		expect(isPubliclyRoutableIpv6('fe80::1')).toBe(false);
	});

	it('rejects link-local addresses outside the literal "fe80" hextet but inside fe80::/10', () => {
		// Regression test: a textual `startsWith('fe80:')` check matches only
		// the single hextet `fe80`, but the real link-local range is
		// `fe80::/10`, which covers every first hextet from `fe80` through
		// `febf` (10 fixed bits leave 6 free bits in that hextet, i.e.
		// 0xfe80-0xfebf). `fe90::1` and `febf::1` are both inside the real
		// range while outside the old literal-prefix check.
		expect(isPubliclyRoutableIpv6('fe90::1')).toBe(false);
		expect(isPubliclyRoutableIpv6('febf::1')).toBe(false);
		expect(isPubliclyRoutableIpv6('fe80::1')).toBe(false);
		expect(isPubliclyRoutableIpv6('fe8f:ffff::1')).toBe(false);
	});

	it('accepts addresses just outside the link-local range', () => {
		// The mask must be exact, not merely "starts with fe": `fe70::1` sits
		// below the fe80::/10 range and `fec0::1` sits above it (both outside
		// the fixed 10 bits), so neither is link-local.
		expect(isPubliclyRoutableIpv6('fe70::1')).toBe(true);
		expect(isPubliclyRoutableIpv6('fec0::1')).toBe(true);
	});
});

describe('checkPublicDnsResolution', () => {
	it('passes when every resolved address is public', async () => {
		const result = await checkPublicDnsResolution('mcp.example.com', async () => [
			{ address: '93.184.216.34', family: 4 },
		]);
		expect(result.problems).toEqual([]);
	});

	it('flags a private address returned for a supposedly public host', async () => {
		const result = await checkPublicDnsResolution('mcp.internal.example.com', async () => [
			{ address: '10.0.0.5', family: 4 },
		]);
		expect(result.problems.length).toBeGreaterThan(0);
		expect(result.problems[0]).toContain('non-public address');
	});

	it('flags resolution failure rather than throwing', async () => {
		const result = await checkPublicDnsResolution('does-not-resolve.example.invalid', async () => {
			throw new Error('ENOTFOUND');
		});
		expect(result.problems.length).toBeGreaterThan(0);
		expect(result.problems[0]).toContain('DNS resolution failed');
	});

	it('flags an empty result set', async () => {
		const result = await checkPublicDnsResolution('empty.example.com', async () => []);
		expect(result.problems.length).toBeGreaterThan(0);
	});

	it('uses the real dns.lookup default when no resolveHostname is injected', async () => {
		// No third argument -- exercises the default parameter's own real
		// `dns.lookup(name, { all: true, verbatim: true })` call, not a test
		// fixture. `localhost` always resolves locally without a network
		// round trip, and is itself non-public (loopback), so this also
		// proves the real lookup's shape (`address`/`family`) flows correctly
		// into the public-address check.
		const result = await checkPublicDnsResolution('localhost');
		expect(result.hostname).toBe('localhost');
		expect(result.addresses.length).toBeGreaterThan(0);
		expect(result.problems.length).toBeGreaterThan(0);
		expect(result.problems[0]).toContain('non-public address');
	});
});

describe('checkNoCrossHostRedirect', () => {
	it('passes a same-origin redirect', async () => {
		const fetchStub = (async () =>
			new Response(null, {
				status: 308,
				headers: { location: 'https://mcp.example.com/mcp/' },
			})) as typeof fetch;

		const result = await checkNoCrossHostRedirect('https://mcp.example.com', '/mcp', fetchStub);
		expect(result.problem).toBeNull();
	});

	it('passes a non-redirect response', async () => {
		const fetchStub = (async () => new Response('{}', { status: 200 })) as typeof fetch;
		const result = await checkNoCrossHostRedirect(
			'https://mcp.example.com',
			'/.well-known/oauth-authorization-server',
			fetchStub,
		);
		expect(result.problem).toBeNull();
	});

	it('flags a redirect to a different origin', async () => {
		const fetchStub = (async () =>
			new Response(null, {
				status: 302,
				headers: { location: 'https://a-different-host.example.net/mcp' },
			})) as typeof fetch;

		const result = await checkNoCrossHostRedirect('https://mcp.example.com', '/mcp', fetchStub);
		expect(result.problem).not.toBeNull();
		expect(result.problem).toContain('different origin');
	});

	it('flags a redirect with no Location header', async () => {
		const fetchStub = (async () => new Response(null, { status: 302 })) as typeof fetch;
		const result = await checkNoCrossHostRedirect('https://mcp.example.com', '/mcp', fetchStub);
		expect(result.problem).not.toBeNull();
		expect(result.problem).toContain('no Location header');
	});

	it('flags a request that fails outright rather than throwing', async () => {
		const fetchStub = (async () => {
			throw new Error('network unreachable');
		}) as typeof fetch;
		const result = await checkNoCrossHostRedirect('https://mcp.example.com', '/mcp', fetchStub);
		expect(result.problem).toContain('failed');
	});
});

describe('checkDiscoveryDocumentIsHealthy', () => {
	// Regression for a round-9 review finding (P2): `deployed-smoke.ts` used
	// to rely on `checkNoCrossHostRedirect`'s "no problem" result (correct
	// for its own narrow purpose, since a 404/500 is not a redirect) to also
	// mean "this discovery document is healthy" -- so a 404 or 500 from a
	// discovery endpoint logged a pass. This function is the actual
	// success/well-formedness check that closes that gap.
	it('flags a 404 from a discovery document as a problem, not a pass', async () => {
		const fetchStub = (async () => new Response('not found', { status: 404 })) as typeof fetch;
		const result = await checkDiscoveryDocumentIsHealthy(
			'https://mcp.example.com',
			'/.well-known/oauth-authorization-server',
			fetchStub,
		);
		expect(result.problem).not.toBeNull();
		expect(result.problem).toContain('404');
	});

	it('flags a 500 from a discovery document as a problem, not a pass', async () => {
		const fetchStub = (async () => new Response('server error', { status: 500 })) as typeof fetch;
		const result = await checkDiscoveryDocumentIsHealthy(
			'https://mcp.example.com',
			'/.well-known/oauth-protected-resource',
			fetchStub,
		);
		expect(result.problem).not.toBeNull();
		expect(result.problem).toContain('500');
	});

	it('flags a 2xx response with a non-JSON body', async () => {
		const fetchStub = (async () =>
			new Response('<html>not json</html>', { status: 200 })) as typeof fetch;
		const result = await checkDiscoveryDocumentIsHealthy(
			'https://mcp.example.com',
			'/.well-known/oauth-authorization-server',
			fetchStub,
		);
		expect(result.problem).not.toBeNull();
		expect(result.problem).toContain('not valid JSON');
	});

	it('passes a 2xx response with a valid JSON body', async () => {
		const fetchStub = (async () =>
			new Response(JSON.stringify({ issuer: 'https://mcp.example.com' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})) as typeof fetch;
		const result = await checkDiscoveryDocumentIsHealthy(
			'https://mcp.example.com',
			'/.well-known/oauth-authorization-server',
			fetchStub,
		);
		expect(result.problem).toBeNull();
	});

	it('flags a request that fails outright rather than throwing', async () => {
		const fetchStub = (async () => {
			throw new Error('network unreachable');
		}) as typeof fetch;
		const result = await checkDiscoveryDocumentIsHealthy(
			'https://mcp.example.com',
			'/.well-known/oauth-authorization-server',
			fetchStub,
		);
		expect(result.problem).toContain('failed');
	});
});

describe('detectStreamBuffering', () => {
	it('recognizes chunks that arrive spaced out like the server actually sent them', () => {
		const result = detectStreamBuffering(
			[{ receivedAtMs: 0 }, { receivedAtMs: 250 }, { receivedAtMs: 505 }],
			200,
		);
		expect(result.buffered).toBe(false);
	});

	it('recognizes a proxy that held the whole response and delivered it as one burst', () => {
		const result = detectStreamBuffering(
			[{ receivedAtMs: 1000 }, { receivedAtMs: 1004 }, { receivedAtMs: 1009 }],
			200,
		);
		expect(result.buffered).toBe(true);
	});

	it('treats fewer than two chunks as inconclusive-and-therefore-buffered', () => {
		const result = detectStreamBuffering([{ receivedAtMs: 0 }], 200);
		expect(result.buffered).toBe(true);
	});
});
