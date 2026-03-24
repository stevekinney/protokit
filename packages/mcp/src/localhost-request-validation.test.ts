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

	it('returns true when host is localhost', () => {
		const headers = new Headers({ host: 'localhost:3000' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(true);
	});

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

	it('returns true when origin is null (sandboxed)', () => {
		const headers = new Headers({ origin: 'null' });
		expect(hasValidLocalhostRebindingHeaders(headers)).toBe(true);
	});
});
