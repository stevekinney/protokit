import { createHash } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import {
	checkAuthorizeRedirectsToSignIn,
	generatePkcePair,
	startLoopbackCallbackListener,
} from '@web/deployed-oauth';
import { isValidPkceCodeChallenge, isValidPkceCodeVerifier } from '@web/lib/pkce-validation';

function fakeResponse(
	status: number,
	headers: Record<string, string> = {},
): {
	status: number;
	headers: { get(name: string): string | null };
} {
	const lowercased = new Map(
		Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
	);
	return { status, headers: { get: (name) => lowercased.get(name.toLowerCase()) ?? null } };
}

// Review finding (P2, `deployed-oauth.ts:261`): any non-5xx response --
// including a 404, a local 400, or an unexpected 200 -- used to be logged
// as a successful probe of the unauthenticated-authorize path. Only a
// same-origin 3xx redirect actually proves the server required sign-in.
describe('checkAuthorizeRedirectsToSignIn', () => {
	const authorizeUrl = new URL('https://deployment.example/oauth/authorize?client_id=abc');

	it('passes for a same-origin 302 redirect to a sign-in path', () => {
		const response = fakeResponse(302, {
			location: '/auth/google/start?callback_path=%2Foauth%2Fauthorize',
		});
		expect(checkAuthorizeRedirectsToSignIn(authorizeUrl, response)).toBeNull();
	});

	it('passes for a same-origin 303 redirect given as an absolute URL', () => {
		const response = fakeResponse(303, {
			location: 'https://deployment.example/auth/google/start',
		});
		expect(checkAuthorizeRedirectsToSignIn(authorizeUrl, response)).toBeNull();
	});

	it('flags a 5xx as a server misconfiguration, not a pass', () => {
		const response = fakeResponse(500);
		const problem = checkAuthorizeRedirectsToSignIn(authorizeUrl, response);
		expect(problem).not.toBeNull();
		expect(problem).toContain('500');
	});

	it('flags an unexpected 200 instead of treating "not a 5xx" as sufficient', () => {
		const response = fakeResponse(200);
		const problem = checkAuthorizeRedirectsToSignIn(authorizeUrl, response);
		expect(problem).not.toBeNull();
		expect(problem).toContain('3xx redirect');
	});

	it('flags a local 400 validation error instead of treating it as a pass', () => {
		const response = fakeResponse(400);
		const problem = checkAuthorizeRedirectsToSignIn(authorizeUrl, response);
		expect(problem).not.toBeNull();
		expect(problem).toContain('3xx redirect');
	});

	it('flags a 404 (routing broken) instead of treating it as a pass', () => {
		const response = fakeResponse(404);
		const problem = checkAuthorizeRedirectsToSignIn(authorizeUrl, response);
		expect(problem).not.toBeNull();
		expect(problem).toContain('3xx redirect');
	});

	it('flags a 3xx with no Location header', () => {
		const response = fakeResponse(302);
		const problem = checkAuthorizeRedirectsToSignIn(authorizeUrl, response);
		expect(problem).not.toBeNull();
		expect(problem).toContain('no Location header');
	});

	it('flags a redirect to a third-party host instead of this deployment', () => {
		const response = fakeResponse(302, { location: 'https://attacker.example/phish' });
		const problem = checkAuthorizeRedirectsToSignIn(authorizeUrl, response);
		expect(problem).not.toBeNull();
		expect(problem).toContain('different origin');
	});
});

// Review finding (P1, `deployed-oauth.ts:192`): this harness used to send a
// LIVE authorization code to `https://example.com/callback` -- a host this
// repository does not control -- paired with the fixed, public RFC 7636
// Appendix B PKCE verifier every reader of this file (or the spec) already
// knows. Anyone who could see that callback had everything needed to
// redeem the code first. These tests cover the two pieces that fix it: a
// fresh PKCE pair every run, and a loopback callback this process actually
// controls.
describe('generatePkcePair', () => {
	it('produces a verifier/challenge pair that satisfies RFC 7636 shape validation', () => {
		const { codeVerifier, codeChallenge } = generatePkcePair();
		expect(isValidPkceCodeVerifier(codeVerifier)).toBe(true);
		expect(isValidPkceCodeChallenge(codeChallenge)).toBe(true);
	});

	it('derives the challenge as S256(verifier), matching what the token endpoint recomputes', () => {
		const { codeVerifier, codeChallenge } = generatePkcePair();
		expect(createHash('sha256').update(codeVerifier).digest('base64url')).toBe(codeChallenge);
	});

	it('is never the fixed RFC 7636 Appendix B example pair this harness used to reuse on every run', () => {
		const { codeVerifier, codeChallenge } = generatePkcePair();
		expect(codeVerifier).not.toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
		expect(codeChallenge).not.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
	});

	it('generates a different pair on each call', () => {
		const first = generatePkcePair();
		const second = generatePkcePair();
		expect(first.codeVerifier).not.toBe(second.codeVerifier);
	});
});

describe('startLoopbackCallbackListener', () => {
	it('registers a portless loopback redirect_uri and listens on 127.0.0.1 with a matching path', () => {
		const loopback = startLoopbackCallbackListener(1000);
		try {
			expect(loopback.registeredRedirectUri).toBe('http://127.0.0.1/callback');
			const redirectUrl = new URL(loopback.redirectUri);
			expect(redirectUrl.protocol).toBe('http:');
			expect(redirectUrl.hostname).toBe('127.0.0.1');
			expect(redirectUrl.pathname).toBe('/callback');
			// Never example.com or any other third-party host -- the entire
			// point of the fix.
			expect(redirectUrl.hostname).not.toBe('example.com');
		} finally {
			loopback.close();
		}
	});

	it('resolves waitForCode with the code from a real request to the loopback listener', async () => {
		const loopback = startLoopbackCallbackListener(5000);
		try {
			const pending = loopback.waitForCode();
			const response = await fetch(`${loopback.redirectUri}?code=captured-auth-code&state=xyz`);
			expect(response.status).toBe(200);
			expect(await pending).toBe('captured-auth-code');
		} finally {
			loopback.close();
		}
	});

	it('rejects waitForCode when the callback carries an error instead of a code', async () => {
		const loopback = startLoopbackCallbackListener(5000);
		try {
			const pending = loopback.waitForCode();
			// Attached immediately so the rejection below is never briefly
			// unhandled between the server-side `rejectCode` call and this
			// test's own `await expect(...).rejects` picking it up.
			pending.catch(() => {});
			await fetch(`${loopback.redirectUri}?error=access_denied`);
			await expect(pending).rejects.toThrow(/access_denied/);
		} finally {
			loopback.close();
		}
	});
});
