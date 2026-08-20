import { describe, expect, it } from 'bun:test';
import { isExactContentType } from '@web/lib/exact-content-type';

describe('isExactContentType', () => {
	it('matches an exact media type', () => {
		expect(isExactContentType('application/json', 'application/json')).toBe(true);
	});

	it('matches when a charset parameter is present', () => {
		expect(isExactContentType('application/json; charset=utf-8', 'application/json')).toBe(true);
	});

	it('is case-insensitive on the media type', () => {
		expect(isExactContentType('Application/JSON', 'application/json')).toBe(true);
	});

	it('rejects a null header', () => {
		expect(isExactContentType(null, 'application/json')).toBe(false);
	});

	it('rejects an unrelated media type', () => {
		expect(isExactContentType('application/xml', 'application/json')).toBe(false);
	});

	it('rejects a media type that merely starts with the expected value', () => {
		expect(isExactContentType('application/json-patch+json', 'application/json')).toBe(false);
	});

	it('rejects a header with multiple joined content-type values (ambiguous encoding)', () => {
		// Fetch's Headers joins repeated header lines with ", ".
		const joined = new Headers();
		joined.append('content-type', 'application/json');
		joined.append('content-type', 'text/plain');
		expect(isExactContentType(joined.get('content-type'), 'application/json')).toBe(false);
	});
});
