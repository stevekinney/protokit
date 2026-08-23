import { describe, expect, it } from 'bun:test';
import {
	deriveSessionCsrfToken,
	deriveSessionCsrfTokenWithSecret,
	isTrustedRequestOrigin,
	isValidSessionCsrfToken,
} from '@web/lib/csrf-protection';

describe('deriveSessionCsrfToken', () => {
	it('is deterministic for the same session token', () => {
		const tokenA = deriveSessionCsrfToken('session-token-abc');
		const tokenB = deriveSessionCsrfToken('session-token-abc');
		expect(tokenA).toBe(tokenB);
	});

	it('differs across session tokens', () => {
		const tokenA = deriveSessionCsrfToken('session-token-abc');
		const tokenB = deriveSessionCsrfToken('session-token-xyz');
		expect(tokenA).not.toBe(tokenB);
	});
});

describe('isValidSessionCsrfToken', () => {
	it('accepts the correctly derived token', () => {
		const token = deriveSessionCsrfToken('session-token-abc');
		expect(isValidSessionCsrfToken('session-token-abc', token)).toBe(true);
	});

	it('rejects a token derived from a different session', () => {
		const token = deriveSessionCsrfToken('session-token-other');
		expect(isValidSessionCsrfToken('session-token-abc', token)).toBe(false);
	});

	it('rejects a missing token', () => {
		expect(isValidSessionCsrfToken('session-token-abc', null)).toBe(false);
		expect(isValidSessionCsrfToken('session-token-abc', undefined)).toBe(false);
	});

	it('rejects an empty token', () => {
		expect(isValidSessionCsrfToken('session-token-abc', '')).toBe(false);
	});

	it('rejects a tampered token of a different length', () => {
		const token = deriveSessionCsrfToken('session-token-abc');
		expect(isValidSessionCsrfToken('session-token-abc', `${token}extra`)).toBe(false);
	});
});

/**
 * DATA-001 / S-18: proves the signing-key overlap/cutover state machine
 * `test:signing-key-rotation` names in the roadmap's verification block,
 * exercised through this module's own injectable `signingSecrets`
 * parameter rather than mutating `@web/env` (which several other test
 * files already mock at module scope — see `session-signing-secret.ts`'s
 * own doc comment for why).
 */
describe('isValidSessionCsrfToken rotation overlap', () => {
	const currentSecret = 'current-secret-aaaaaaaaaaaaaaaa';
	const previousSecret = 'previous-secret-bbbbbbbbbbbbbbb';
	const retiredSecret = 'retired-secret-ccccccccccccccc';
	const sessionToken = 'session-token-abc';

	it('accepts a token derived under the current secret when an overlap set is configured', () => {
		const token = deriveSessionCsrfTokenWithSecret(sessionToken, currentSecret);
		expect(isValidSessionCsrfToken(sessionToken, token, [currentSecret, previousSecret])).toBe(
			true,
		);
	});

	it('accepts a token derived under the previous secret during the overlap window (rotation)', () => {
		const token = deriveSessionCsrfTokenWithSecret(sessionToken, previousSecret);
		expect(isValidSessionCsrfToken(sessionToken, token, [currentSecret, previousSecret])).toBe(
			true,
		);
	});

	it('rejects a token derived under a retired secret once the overlap set no longer includes it (cutover)', () => {
		const token = deriveSessionCsrfTokenWithSecret(sessionToken, retiredSecret);
		expect(isValidSessionCsrfToken(sessionToken, token, [currentSecret, previousSecret])).toBe(
			false,
		);
		// Before the cutover, the same token was accepted -- proving this is a
		// state transition, not a token that was simply always invalid.
		expect(isValidSessionCsrfToken(sessionToken, token, [currentSecret, retiredSecret])).toBe(true);
	});
});

describe('isTrustedRequestOrigin', () => {
	const expectedOrigin = 'https://app.example.com';

	it('accepts sec-fetch-site: same-origin', () => {
		const request = new Request('https://app.example.com/auth/sign-out', {
			method: 'POST',
			headers: { 'sec-fetch-site': 'same-origin' },
		});
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(true);
	});

	it('accepts sec-fetch-site: none', () => {
		const request = new Request('https://app.example.com/auth/sign-out', {
			method: 'POST',
			headers: { 'sec-fetch-site': 'none' },
		});
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(true);
	});

	it('rejects sec-fetch-site: cross-site even when Origin matches', () => {
		const request = new Request('https://app.example.com/auth/sign-out', {
			method: 'POST',
			headers: { 'sec-fetch-site': 'cross-site', origin: expectedOrigin },
		});
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(false);
	});

	it('falls back to a matching Origin header when sec-fetch-site is absent', () => {
		const request = new Request('https://app.example.com/auth/sign-out', {
			method: 'POST',
			headers: { origin: expectedOrigin },
		});
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(true);
	});

	it('rejects a mismatched Origin header', () => {
		const request = new Request('https://app.example.com/auth/sign-out', {
			method: 'POST',
			headers: { origin: 'https://evil.example.com' },
		});
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(false);
	});

	it('fails closed when neither header is present', () => {
		const request = new Request('https://app.example.com/auth/sign-out', { method: 'POST' });
		expect(isTrustedRequestOrigin(request, expectedOrigin)).toBe(false);
	});
});
