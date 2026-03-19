import { describe, expect, it } from 'bun:test';
import { parseCookies } from '@web/lib/cookies';

describe('parseCookies', () => {
	it('decodes valid encoded cookie names and values', () => {
		const parsedCookies = parseCookies('name%20one=value%20one');
		expect(parsedCookies.get('name one')).toBe('value one');
	});

	it('falls back to raw key and value when decoding fails', () => {
		const parsedCookies = parseCookies('session%=bad%value');
		expect(parsedCookies.get('session%')).toBe('bad%value');
	});
});
