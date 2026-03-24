import { describe, expect, it } from 'bun:test';
import { getRequestClientIdentifier } from '@web/lib/request-client-identifier';

function requestWithHeaders(headers: Record<string, string>): Request {
	return new Request('http://localhost/', { headers });
}

describe('getRequestClientIdentifier', () => {
	it('returns the first x-forwarded-for value', () => {
		const result = getRequestClientIdentifier({
			request: requestWithHeaders({ 'x-forwarded-for': '1.2.3.4' }),
		});
		expect(result).toBe('1.2.3.4');
	});

	it('returns only the first IP from a multi-value x-forwarded-for', () => {
		const result = getRequestClientIdentifier({
			request: requestWithHeaders({ 'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3' }),
		});
		expect(result).toBe('10.0.0.1');
	});

	it('falls back to cf-connecting-ip when x-forwarded-for is absent', () => {
		const result = getRequestClientIdentifier({
			request: requestWithHeaders({ 'cf-connecting-ip': '5.6.7.8' }),
		});
		expect(result).toBe('5.6.7.8');
	});

	it('prefers x-forwarded-for over cf-connecting-ip', () => {
		const result = getRequestClientIdentifier({
			request: requestWithHeaders({
				'x-forwarded-for': '1.1.1.1',
				'cf-connecting-ip': '2.2.2.2',
			}),
		});
		expect(result).toBe('1.1.1.1');
	});

	it('falls back to the provided fallback client address', () => {
		const result = getRequestClientIdentifier({
			request: requestWithHeaders({}),
			fallbackClientAddress: '192.168.1.1',
		});
		expect(result).toBe('192.168.1.1');
	});

	it('returns unknown-client when no identifier is available', () => {
		const result = getRequestClientIdentifier({
			request: requestWithHeaders({}),
		});
		expect(result).toBe('unknown-client');
	});
});
