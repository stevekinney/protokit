import { describe, expect, it } from 'bun:test';
import {
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
