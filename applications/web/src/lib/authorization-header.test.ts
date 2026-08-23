import { describe, expect, it } from 'bun:test';
import { parseAuthorizationHeader, parseBearerCredential } from './authorization-header';

describe('parseAuthorizationHeader', () => {
	it('splits a single-space header into scheme and credential', () => {
		expect(parseAuthorizationHeader('Bearer abc123')).toEqual({
			scheme: 'Bearer',
			credential: 'abc123',
		});
	});

	it('skips the complete whitespace run, not just the first space', () => {
		// The reported defect: RFC 9110 §11.1 separates the scheme from the
		// credential with `1*SP`, so this is a compliant request. Slicing at
		// the first space left `'  abc123'` as the credential, which could
		// never match a stored value.
		expect(parseAuthorizationHeader('Bearer   abc123').credential).toBe('abc123');
		expect(parseAuthorizationHeader('Bearer\t\tabc123').credential).toBe('abc123');
	});

	it('returns the scheme verbatim so callers own the case comparison', () => {
		expect(parseAuthorizationHeader('bEaReR abc123').scheme).toBe('bEaReR');
	});

	it('never trims the credential itself', () => {
		// A token carrying trailing whitespace must fail to match rather than
		// be rewritten into a value the caller never presented.
		expect(parseAuthorizationHeader('Bearer abc123  ').credential).toBe('abc123  ');
		expect(parseAuthorizationHeader('Bearer abc 123').credential).toBe('abc 123');
	});

	it('yields nothing for a header with no separator at all', () => {
		expect(parseAuthorizationHeader('Bearer')).toEqual({
			scheme: undefined,
			credential: undefined,
		});
	});

	it('yields nothing for an absent or empty header', () => {
		expect(parseAuthorizationHeader(null).scheme).toBeUndefined();
		expect(parseAuthorizationHeader(undefined).scheme).toBeUndefined();
		expect(parseAuthorizationHeader('').scheme).toBeUndefined();
	});

	it('treats an empty credential after the separator as an empty string, not absent', () => {
		// `Bearer ` is malformed but distinguishable from `Bearer`; callers
		// reject it on the empty-length check rather than on a missing scheme.
		expect(parseAuthorizationHeader('Bearer ')).toEqual({ scheme: 'Bearer', credential: '' });
	});
});

describe('parseBearerCredential', () => {
	it('matches the scheme case-insensitively', () => {
		expect(parseBearerCredential('bearer abc123')).toBe('abc123');
		expect(parseBearerCredential('BEARER abc123')).toBe('abc123');
	});

	it('skips the complete whitespace run', () => {
		expect(parseBearerCredential('Bearer     abc123')).toBe('abc123');
	});

	it('refuses a non-bearer scheme', () => {
		expect(parseBearerCredential('Basic abc123')).toBeUndefined();
		expect(parseBearerCredential('Bearerish abc123')).toBeUndefined();
	});
});
