import { createHmac } from 'node:crypto';
import { constantTimeEquals } from '@web/lib/constant-time-equals';
import { sessionSigningSecret } from '@web/lib/session-signing-secret';

/**
 * A stateless, session-bound CSRF token for routes that have no dedicated
 * server-side transaction of their own (SEC-005 / S-09: "Add CSRF
 * protection to every cookie-authenticated state-changing route, including
 * sign-out"). `/oauth/authorize/approve` and `/oauth/authorize/deny` use a
 * one-time value stored on their authorization transaction instead — see
 * `authorization-transaction.ts` — because those routes already have a
 * server-side record to bind a one-time value to.
 *
 * This token is an HMAC of the session token keyed by the server's session
 * signing secret. It is safe to render into HTML: an attacker who cannot
 * forge the HMAC (no access to the secret) or read the session cookie
 * (`HttpOnly`) cannot reproduce it, so a cross-site form submission cannot
 * supply a valid value.
 */
export function deriveSessionCsrfToken(sessionToken: string): string {
	return createHmac('sha256', sessionSigningSecret).update(sessionToken).digest('hex');
}

export function isValidSessionCsrfToken(
	sessionToken: string,
	submittedToken: string | null | undefined,
): boolean {
	if (!submittedToken) {
		return false;
	}

	return constantTimeEquals(deriveSessionCsrfToken(sessionToken), submittedToken);
}

/**
 * Defense-in-depth against CSRF alongside the token above (roadmap:
 * "Validate `Origin` or `Sec-Fetch-Site` as defense in depth"). Prefers the
 * modern `Sec-Fetch-Site` header (sent by all current browsers on
 * navigations and form submissions); falls back to `Origin` for clients
 * that omit it. Fails closed — a cookie-authenticated, state-changing
 * request that supplies neither header cannot prove it originated
 * same-origin, so it is rejected.
 */
export function isTrustedRequestOrigin(request: Request, expectedOrigin: string): boolean {
	const secFetchSite = request.headers.get('sec-fetch-site');
	if (secFetchSite) {
		return secFetchSite === 'same-origin' || secFetchSite === 'none';
	}

	const origin = request.headers.get('origin');
	if (origin) {
		return origin === expectedOrigin;
	}

	return false;
}
