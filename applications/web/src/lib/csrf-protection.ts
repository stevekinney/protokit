import { createHmac } from 'node:crypto';
import { constantTimeEquals } from '@lostgradient/mcp/oauth';
import { sessionSigningSecret, sessionSigningSecrets } from '@web/lib/session-signing-secret';

/**
 * A stateless, session-bound CSRF token for routes that have no dedicated
 * server-side transaction of their own (SEC-005 / S-09: "Add CSRF
 * protection to every cookie-authenticated state-changing route, including
 * sign-out"). `/oauth/authorize/approve` and `/oauth/authorize/deny` use a
 * one-time value stored on their authorization transaction instead — see
 * the library OAuth transaction store — because those routes already have a
 * server-side record to bind a one-time value to.
 *
 * This token is an HMAC of the session token keyed by the server's session
 * signing secret. It is safe to render into HTML: an attacker who cannot
 * forge the HMAC (no access to the secret) or read the session cookie
 * (`HttpOnly`) cannot reproduce it, so a cross-site form submission cannot
 * supply a valid value.
 */
export function deriveSessionCsrfTokenWithSecret(sessionToken: string, secret: string): string {
	return createHmac('sha256', secret).update(sessionToken).digest('hex');
}

export function deriveSessionCsrfToken(sessionToken: string): string {
	return deriveSessionCsrfTokenWithSecret(sessionToken, sessionSigningSecret);
}

/**
 * DATA-001 / S-18: accepts a token derived under the current signing secret
 * OR any secret still inside its rotation overlap window
 * (`sessionSigningSecrets`), so a session-signing-secret rotation does not
 * instantly invalidate every open tab's already-rendered CSRF token. Once a
 * rotation's cutover clears the overlap set, a token derived only under the
 * retired secret stops matching here — that is acceptance criterion 5's
 * "rejects retired keys after the cutover."
 */
export function isValidSessionCsrfToken(
	sessionToken: string,
	submittedToken: string | null | undefined,
	signingSecrets: readonly string[] = sessionSigningSecrets,
): boolean {
	if (!submittedToken) {
		return false;
	}

	return signingSecrets.some((secret) =>
		constantTimeEquals(deriveSessionCsrfTokenWithSecret(sessionToken, secret), submittedToken),
	);
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
