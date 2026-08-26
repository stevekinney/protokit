import { describe, expect, it } from 'bun:test';
import { parseCookies, serializeCookie } from '@web/lib/cookies';

describe('parseCookies', () => {
	it('decodes valid encoded cookie names and values', () => {
		const parsedCookies = parseCookies('name%20one=value%20one');
		expect(parsedCookies.get('name one')).toBe('value one');
	});

	it('falls back to raw key and value when decoding fails', () => {
		const parsedCookies = parseCookies('session%=bad%value');
		expect(parsedCookies.get('session%')).toBe('bad%value');
	});

	it('returns an empty map for a null header', () => {
		const parsedCookies = parseCookies(null);
		expect(parsedCookies.size).toBe(0);
	});

	it('parses multiple cookies separated by semicolons, trimming surrounding whitespace', () => {
		const parsedCookies = parseCookies('a=1; b=2;  c=3');
		expect(parsedCookies.get('a')).toBe('1');
		expect(parsedCookies.get('b')).toBe('2');
		expect(parsedCookies.get('c')).toBe('3');
	});

	it('skips an entry with no "=" separator instead of throwing', () => {
		const parsedCookies = parseCookies('malformed-flag; name=value');
		expect(parsedCookies.has('malformed-flag')).toBe(false);
		expect(parsedCookies.get('name')).toBe('value');
	});

	it('ignores empty entries produced by stray or trailing semicolons', () => {
		const parsedCookies = parseCookies(';; a=1;;');
		expect(parsedCookies.get('a')).toBe('1');
		expect(parsedCookies.size).toBe(1);
	});
});

describe('serializeCookie', () => {
	it('encodes the name and value and defaults to Path=/, HttpOnly, and SameSite=Lax', () => {
		const serialized = serializeCookie({ name: 'session id', value: 'value with spaces' });
		expect(serialized).toBe('session%20id=value%20with%20spaces; Path=/; HttpOnly; SameSite=Lax');
	});

	it('uses a custom path when provided', () => {
		const serialized = serializeCookie({ name: 'a', value: '1', path: '/oauth' });
		expect(serialized).toContain('Path=/oauth');
	});

	it('appends Max-Age, flooring a fractional value', () => {
		const serialized = serializeCookie({ name: 'a', value: '1', maxAgeSeconds: 120.9 });
		expect(serialized).toContain('Max-Age=120');
	});

	it('clamps a negative Max-Age to zero rather than emitting a negative value', () => {
		const serialized = serializeCookie({ name: 'a', value: '1', maxAgeSeconds: -50 });
		expect(serialized).toContain('Max-Age=0');
	});

	it('omits HttpOnly when explicitly set to false', () => {
		const serialized = serializeCookie({ name: 'a', value: '1', httpOnly: false });
		expect(serialized).not.toContain('HttpOnly');
	});

	it('includes HttpOnly when left undefined (defaults to true)', () => {
		const serialized = serializeCookie({ name: 'a', value: '1' });
		expect(serialized).toContain('HttpOnly');
	});

	it('appends Secure only when explicitly requested', () => {
		const insecure = serializeCookie({ name: 'a', value: '1' });
		expect(insecure).not.toContain('Secure');

		const secure = serializeCookie({ name: 'a', value: '1', secure: true });
		expect(secure).toContain('Secure');
	});

	it('uses a custom SameSite value when provided', () => {
		const serialized = serializeCookie({ name: 'a', value: '1', sameSite: 'None' });
		expect(serialized).toContain('SameSite=None');
	});
});
