import { describe, expect, it } from 'bun:test';
import { isExactContentType } from '@lostgradient/mcp/oauth';

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

	it('rejects a joined header whose FIRST value has a parameter (round-9 review finding)', () => {
		// Splitting only at the first semicolon before checking for a second
		// comma-separated value used to yield "application/json" here and
		// accept it, even though the header actually carries two conflicting
		// media types once charset is attached to the first one.
		const joined = new Headers();
		joined.append('content-type', 'application/json; charset=utf-8');
		joined.append('content-type', 'text/plain');
		expect(joined.get('content-type')).toBe('application/json; charset=utf-8, text/plain');
		expect(isExactContentType(joined.get('content-type'), 'application/json')).toBe(false);
	});

	it('does not reject a single value whose parameter happens to contain a comma', () => {
		// A comma inside a quoted parameter value (e.g. a multipart boundary)
		// is not a second, ambiguous media type -- only a real top-level
		// comma is.
		expect(isExactContentType('multipart/form-data; boundary="a,b,c"', 'multipart/form-data')).toBe(
			true,
		);
	});
});
