import { describe, expect, it, mock } from 'bun:test';

const mockEnvironment: Record<string, unknown> = {
	TRUSTED_PROXY_CIDRS: undefined,
	TRUSTED_PROXY_HEADER: undefined,
	TRUSTED_PROXY_HOP_COUNT: 1,
};

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

const { getRequestClientIdentifier } = await import('@web/lib/request-client-identifier');

function requestWithHeaders(headers: Record<string, string>): Request {
	return new Request('http://localhost/', { headers });
}

describe('getRequestClientIdentifier', () => {
	it('uses the socket address and ignores x-forwarded-for when nothing is trusted', () => {
		mockEnvironment.TRUSTED_PROXY_CIDRS = undefined;
		mockEnvironment.TRUSTED_PROXY_HEADER = undefined;

		const result = getRequestClientIdentifier({
			request: requestWithHeaders({ 'x-forwarded-for': '1.2.3.4' }),
			socketAddress: '203.0.113.9',
		});
		expect(result).toBe('203.0.113.9');
	});

	it('changing x-forwarded-for from an untrusted peer does not change the identity', () => {
		mockEnvironment.TRUSTED_PROXY_CIDRS = undefined;
		mockEnvironment.TRUSTED_PROXY_HEADER = undefined;

		const first = getRequestClientIdentifier({
			request: requestWithHeaders({ 'x-forwarded-for': '1.2.3.4' }),
			socketAddress: '203.0.113.9',
		});
		const second = getRequestClientIdentifier({
			request: requestWithHeaders({ 'x-forwarded-for': '9.9.9.9' }),
			socketAddress: '203.0.113.9',
		});
		expect(first).toBe(second);
	});

	it('trusts x-forwarded-for once the peer and header are configured as trusted', () => {
		mockEnvironment.TRUSTED_PROXY_CIDRS = '10.0.0.0/8';
		mockEnvironment.TRUSTED_PROXY_HEADER = 'x-forwarded-for';
		mockEnvironment.TRUSTED_PROXY_HOP_COUNT = 1;

		const result = getRequestClientIdentifier({
			request: requestWithHeaders({ 'x-forwarded-for': '5.6.7.8' }),
			socketAddress: '10.1.1.1',
		});
		expect(result).toBe('5.6.7.8');
	});

	it('falls back to the socket address when the trusted header is absent', () => {
		mockEnvironment.TRUSTED_PROXY_CIDRS = '10.0.0.0/8';
		mockEnvironment.TRUSTED_PROXY_HEADER = 'x-forwarded-for';

		const result = getRequestClientIdentifier({
			request: requestWithHeaders({}),
			socketAddress: '10.1.1.1',
		});
		expect(result).toBe('10.1.1.1');
	});

	it('returns unknown-client when no socket address is available and nothing is trusted', () => {
		mockEnvironment.TRUSTED_PROXY_CIDRS = undefined;
		mockEnvironment.TRUSTED_PROXY_HEADER = undefined;

		const result = getRequestClientIdentifier({
			request: requestWithHeaders({}),
		});
		expect(result).toBe('unknown-client');
	});

	it('canonicalizes an IPv4-mapped IPv6 socket address to the same identity as plain IPv4', () => {
		mockEnvironment.TRUSTED_PROXY_CIDRS = undefined;
		mockEnvironment.TRUSTED_PROXY_HEADER = undefined;

		const mapped = getRequestClientIdentifier({
			request: requestWithHeaders({}),
			socketAddress: '::ffff:203.0.113.9',
		});
		const plain = getRequestClientIdentifier({
			request: requestWithHeaders({}),
			socketAddress: '203.0.113.9',
		});
		expect(mapped).toBe(plain);
	});
});
