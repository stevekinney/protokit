import { describe, expect, it } from 'bun:test';
import { isValidClientName } from '@lostgradient/mcp/oauth';

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

	/**
	 * A P2 review finding: `P\u0430yPal` (Cyrillic \u0430, U+0430, standing in for
	 * Latin a) contains no control, bidi, or zero-width character and
	 * previously passed every check above, rendering on the consent screen
	 * as a visually perfect impersonation of a real relying party. See
	 * the module's doc comment for why the fix is a mixed-script check
	 * (Latin mixed with Cyrillic or Greek) rather than a full Unicode
	 * confusable-skeleton comparison, and what that deliberately leaves
	 * uncovered.
	 */
	it('rejects a name mixing Latin and Cyrillic look-alike characters', () => {
		expect(isValidClientName('P\u0430yPal')).toBe(false);
	});

	it('rejects a name mixing Latin and Greek look-alike characters', () => {
		// Greek capital Alpha (U+0391) in place of Latin A.
		expect(isValidClientName('\u0391pple')).toBe(false);
	});

	it('accepts a name written entirely in Cyrillic', () => {
		// "Yandex.Mail" -- an entirely Cyrillic, non-Latin-mixed name must
		// not be penalized merely for using a non-Latin script.
		expect(
			isValidClientName('\u042F\u043D\u0434\u0435\u043A\u0441.\u041F\u043E\u0447\u0442\u0430'),
		).toBe(true);
	});

	it('accepts a name written entirely in Greek', () => {
		expect(isValidClientName('\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC')).toBe(true);
	});

	it('accepts an ordinary Latin name mixed with digits and punctuation', () => {
		expect(isValidClientName('App 2.0 - Beta!')).toBe(true);
	});
});
