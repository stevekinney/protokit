import { constantTimeEquals } from '@web/lib/constant-time-equals';

/**
 * OPS-002 / S-15: shared bearer-credential check for `/metrics` and
 * `/health/ready` — operator-facing endpoints gated by a single rotating
 * secret rather than a user session. Pure function (the configured key and
 * the presented header are both parameters) so tests exercise every branch
 * directly instead of mocking `@web/env`, matching the pattern
 * `applySecurityHeaders` and `resolveSessionSigningSecrets` document.
 *
 * Returns a tri-state rather than a boolean because the caller needs to
 * distinguish "not configured" (respond 404 — the route's mere existence
 * should not be discoverable) from "configured but the presented value
 * didn't match" (respond 401).
 */
export type BearerCredentialCheckResult = 'not_configured' | 'unauthorized' | 'authorized';

export function checkBearerCredential(input: {
	configuredKey: string | undefined;
	authorizationHeader: string | null;
}): BearerCredentialCheckResult {
	if (!input.configuredKey) {
		return 'not_configured';
	}

	const presented = input.authorizationHeader?.startsWith('Bearer ')
		? input.authorizationHeader.slice('Bearer '.length)
		: undefined;

	if (!presented || !constantTimeEquals(presented, input.configuredKey)) {
		return 'unauthorized';
	}

	return 'authorized';
}

/**
 * OPS-002: refuses a credential-bearing request sent over plaintext HTTP in
 * production. Trusts `X-Forwarded-Proto` rather than requiring its own
 * trusted-proxy CIDR configuration (unlike `request-client-identifier.ts`,
 * which must resolve a real client *identity* an attacker could spoof to
 * evade a rate limit or impersonate another caller) — spoofing this header
 * gains an attacker nothing: the bearer credential is still checked
 * unconditionally afterward, and the only thing a forged "https" value can
 * do is let a request that is *actually* plaintext skip a warning-shaped
 * guard whose entire purpose is protecting the credential the caller who
 * sent it already possesses. Skipped outside production because local/dev
 * traffic is routinely plain HTTP on loopback, same reasoning as HSTS in
 * `application.tsx`.
 */
export function isPlaintextTransport(input: { request: Request; isProduction: boolean }): boolean {
	if (!input.isProduction) return false;

	const forwardedProto = input.request.headers.get('x-forwarded-proto');
	if (forwardedProto) {
		return forwardedProto.toLowerCase() !== 'https';
	}

	return new URL(input.request.url).protocol !== 'https:';
}
