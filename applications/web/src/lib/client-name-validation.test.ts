import { describe, expect, it } from 'bun:test';
import { isValidClientName } from '@web/lib/client-name-validation';

describe('isValidClientName', () => {
	it('accepts an ordinary ASCII name', () => {
		expect(isValidClientName('My App')).toBe(true);
	});

	it('accepts ordinary non-Latin text', () => {
		expect(isValidClientName('\u65E5\u672C\u8A9E\u30A2\u30D7\u30EA')).toBe(true);
	});

	it('rejects an empty name', () => {
		expect(isValidClientName('')).toBe(false);
	});

	it('rejects a name containing a NUL byte', () => {
		expect(isValidClientName('My\u0000App')).toBe(false);
	});

	it('rejects a name containing a newline', () => {
		expect(isValidClientName('My\nApp')).toBe(false);
	});

	it('rejects a name containing a C1 control character', () => {
		expect(isValidClientName('My\u0085App')).toBe(false);
	});

	it('rejects a name containing a right-to-left override', () => {
		expect(isValidClientName('My\u202EApp')).toBe(false);
	});

	it('rejects a name containing isolate formatting characters', () => {
		expect(isValidClientName('My\u2066App\u2069')).toBe(false);
	});

	it('rejects a name containing a bare left-to-right mark', () => {
		expect(isValidClientName('My\u200EApp')).toBe(false);
	});

	it('rejects a name containing a zero-width space', () => {
		expect(isValidClientName('My\u200BApp')).toBe(false);
	});

	it('rejects a name containing a byte-order mark', () => {
		expect(isValidClientName('\uFEFFMy App')).toBe(false);
	});
});
