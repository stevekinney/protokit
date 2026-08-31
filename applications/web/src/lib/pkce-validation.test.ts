import { describe, expect, it } from 'bun:test';
import { isValidPkceCodeChallenge, isValidPkceCodeVerifier } from '@lostgradient/mcp/oauth';

// The exact example values from RFC 7636 Appendix B.
const rfc7636CodeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const rfc7636CodeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('isValidPkceCodeVerifier', () => {
	it('accepts the RFC 7636 example verifier', () => {
		expect(isValidPkceCodeVerifier(rfc7636CodeVerifier)).toBe(true);
	});

	it('accepts the minimum length (43 characters)', () => {
		expect(isValidPkceCodeVerifier('a'.repeat(43))).toBe(true);
	});

	it('accepts the maximum length (128 characters)', () => {
		expect(isValidPkceCodeVerifier('a'.repeat(128))).toBe(true);
	});

	it('rejects a verifier shorter than 43 characters', () => {
		expect(isValidPkceCodeVerifier('a'.repeat(42))).toBe(false);
	});

	it('rejects a verifier longer than 128 characters', () => {
		expect(isValidPkceCodeVerifier('a'.repeat(129))).toBe(false);
	});

	it('rejects characters outside the unreserved set', () => {
		expect(isValidPkceCodeVerifier(`${'a'.repeat(42)}!`)).toBe(false);
		expect(isValidPkceCodeVerifier(`${'a'.repeat(42)}+`)).toBe(false);
		expect(isValidPkceCodeVerifier(`${'a'.repeat(42)}/`)).toBe(false);
		expect(isValidPkceCodeVerifier(`${'a'.repeat(42)} `)).toBe(false);
	});

	it('rejects the empty string', () => {
		expect(isValidPkceCodeVerifier('')).toBe(false);
	});
});

describe('isValidPkceCodeChallenge', () => {
	it('accepts the RFC 7636 example S256 challenge', () => {
		expect(isValidPkceCodeChallenge(rfc7636CodeChallenge)).toBe(true);
	});

	it('rejects a challenge shorter than 43 characters', () => {
		expect(isValidPkceCodeChallenge('abc')).toBe(false);
	});

	it('rejects a challenge longer than 43 characters', () => {
		expect(isValidPkceCodeChallenge(`${rfc7636CodeChallenge}x`)).toBe(false);
	});

	it('rejects padded base64 (a "=" character)', () => {
		expect(isValidPkceCodeChallenge(`${'a'.repeat(42)}=`)).toBe(false);
	});

	it('rejects standard (non-url-safe) base64 characters', () => {
		expect(isValidPkceCodeChallenge(`${'a'.repeat(41)}+/`)).toBe(false);
	});
});
