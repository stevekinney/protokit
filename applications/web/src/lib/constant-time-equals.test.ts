import { describe, expect, it } from 'bun:test';
import { constantTimeEquals } from '@web/lib/constant-time-equals';

describe('constantTimeEquals', () => {
	it('returns true for equal strings', () => {
		expect(constantTimeEquals('hello', 'hello')).toBe(true);
	});

	it('returns false for unequal strings of the same length', () => {
		expect(constantTimeEquals('hello', 'world')).toBe(false);
	});

	it('returns false for strings of different lengths', () => {
		expect(constantTimeEquals('short', 'much longer string')).toBe(false);
	});

	it('returns true for empty strings', () => {
		expect(constantTimeEquals('', '')).toBe(true);
	});
});
