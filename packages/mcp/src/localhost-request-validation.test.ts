import { describe, expect, it } from 'bun:test';
import {
	isLoopbackHostname,
	hasValidLocalhostRebindingHeaders,
} from './localhost-request-validation';

describe('isLoopbackHostname', () => {
	it('returns true for localhost', () => {
		expect(isLoopbackHostname('localhost')).toBe(true);
	});

	it('returns true for 127.0.0.1', () => {
		expect(isLoopbackHostname('127.0.0.1')).toBe(true);
	});

	it('returns true for ::1', () => {
		expect(isLoopbackHostname('::1')).toBe(true);
	});

	it('returns true for [::1]', () => {
		expect(isLoopbackHostname('[::1]')).toBe(true);
	});

	it('returns false for example.com', () => {
		expect(isLoopbackHostname('example.com')).toBe(false);
	});

	it('returns false for 10.0.0.1', () => {
		expect(isLoopbackHostname('10.0.0.1')).toBe(false);
	});

	it('is case-insensitive', () => {
		expect(isLoopbackHostname('LOCALHOST')).toBe(true);
	});
});

describe('hasValidLocalhostRebindingHeaders', () => {
	it('returns true when no host or origin headers are set', () => {
		const headers = new Headers();
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(true);
	});

	it.each(['localhost', 'localhost:3000'])(
		'allows an absent origin for non-browser clients with host %s',
		(host) => {
			const headers = new Headers({ host });
			expect(hasValidLocalhostRebindingHeaders(headers)).toBe(true);
		},
	);

	it('returns false when host is a non-localhost domain', () => {
		const headers = new Headers({ host: 'evil.com:3000' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(false);
	});

	it('returns true when origin is localhost', () => {
		const headers = new Headers({ origin: 'http://localhost:3000' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(true);
	});

	it('returns false when origin is a non-localhost URL', () => {
		const headers = new Headers({ origin: 'https://evil.com' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(false);
	});

	it('returns true when both host and origin are localhost', () => {
		const headers = new Headers({
			host: '127.0.0.1:3000',
			origin: 'http://127.0.0.1:3000',
		});
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(true);
	});

	it('returns false when host is localhost but origin is not', () => {
		const headers = new Headers({
			host: 'localhost:3000',
			origin: 'https://evil.com',
		});
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(false);
	});

	it('rejects an opaque origin even with a localhost host', () => {
		// TRI-79: Inspector's Node-fetch MCP connection does not require an
		// opaque origin. Sandboxed app traffic cannot establish a local origin.
		const headers = new Headers({ host: 'localhost:3000', origin: 'null' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(false);
	});

	it('rejects an opaque origin without a host header', () => {
		const headers = new Headers({ origin: 'null' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(false);
	});

	it('treats an empty first host value (e.g. a leading comma) as absent', () => {
		// `hostHeader.split(',')[0].trim()` produces an empty string when the
		// header's first comma-separated value is blank -- must fall through
		// to "no host to validate" rather than rejecting the request.
		const headers = new Headers({ host: ',localhost' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(true);
	});

	it('accepts a bracketed IPv6 host header with no port', () => {
		const headers = new Headers({ host: '[::1]' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(true);
	});

	it('accepts a bracketed IPv6 host header with a port', () => {
		const headers = new Headers({ host: '[::1]:3000' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(true);
	});

	it('rejects a non-localhost bracketed IPv6-shaped host header', () => {
		const headers = new Headers({ host: '[dead::beef]:3000' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(false);
	});

	it.each(['not-a-valid-url', '', '   ', 'data:text/plain,hello'])(
		'rejects an unverifiable present origin: %j',
		(origin) => {
			// TRI-79: only an absent header gets the non-browser allowance;
			// malformed, empty, and hostless values cannot identify localhost.
			const headers = new Headers({ host: 'localhost:3000', origin });
			expect(hasValidLocalhostRebindingHeaders(headers)).toBe(false);
		},
	);
});
