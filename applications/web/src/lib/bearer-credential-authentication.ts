import { parseBearerCredential } from '@web/lib/authorization-header';
import { canonicalizeIpAddress } from '@lostgradient/mcp/oauth';
import { constantTimeEquals } from '@web/lib/constant-time-equals';
import { isSocketPeerTrusted, type TrustedProxyConfiguration } from '@web/lib/trusted-proxy';

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

	// Round 10 review finding: RFC 9110 §11.1 registers HTTP authentication
	// scheme names case-insensitively -- a compliant client sending
	// `Authorization: bearer <key>` (or `BEARER`/any other casing) was
	// rejected outright by the original case-sensitive `startsWith`.
	//
	// Round 17 review finding: the separator is `1*SP`, not exactly one
	// space, and this parser is shared with `/mcp` rather than duplicated --
	// see `authorization-header.ts` for both.
	const presented = parseBearerCredential(input.authorizationHeader);

	if (!presented || !constantTimeEquals(presented, input.configuredKey)) {
		return 'unauthorized';
	}

	return 'authorized';
}

/**
 * OPS-002: refuses a credential-bearing request sent over plaintext HTTP in
 * production. `X-Forwarded-Proto` is honored only when the immediate
 * socket peer is a configured trusted proxy (`TRUSTED_PROXY_CIDRS`, the
 * same mechanism `request-client-identifier.ts` uses for client identity),
 * never unconditionally.
 *
 * A P2 review finding, and a correction to an earlier round's dismissal of
 * the same finding: the earlier reasoning was that a forged header
 * "exposes nothing new" because the credential the header spoof accompanies
 * is already the sender's own, already sent in the clear on their own
 * connection. That much is still true -- this check cannot let one caller
 * steal another caller's credential. What that reasoning missed is that
 * `TRUSTED_PROXY_CIDRS`/`TRUSTED_PROXY_HEADER` (added by `SEC-003`, and
 * REQUIRED in production by `assertProductionStartupInvariants`) already
 * give this codebase a real way to know "this specific forwarded-\* header
 * came from a reverse proxy I actually operate," not merely "some caller
 * chose to send it." Trusting `X-Forwarded-Proto` unconditionally meant an
 * on-path attacker who downgrades a genuine caller's TLS connection to
 * plaintext (or anyone who can simply reach this origin directly) could
 * also forge `https` on that same request, defeating the one signal this
 * check exists to produce -- "was this transport actually secure" -- in
 * exactly the direct-origin/misconfigured-proxy scenario the check is
 * supposed to catch. Reusing the already-required trusted-proxy
 * configuration costs nothing new operationally (every real production
 * deployment already configures it) and makes the header trustworthy only
 * when it actually can be. Skipped outside production because local/dev
 * traffic is routinely plain HTTP on loopback, same reasoning as HSTS in
 * `application.ts`.
 */
export function isPlaintextTransport(input: {
	request: Request;
	isProduction: boolean;
	socketAddress: string | undefined;
	trustedProxyConfiguration: TrustedProxyConfiguration;
}): boolean {
	if (!input.isProduction) return false;

	const forwardedProto = input.request.headers.get('x-forwarded-proto');
	if (forwardedProto && isForwardedProtoTrustworthy(input)) {
		return forwardedProto.toLowerCase() !== 'https';
	}

	return new URL(input.request.url).protocol !== 'https:';
}

function isForwardedProtoTrustworthy(input: {
	socketAddress: string | undefined;
	trustedProxyConfiguration: TrustedProxyConfiguration;
}): boolean {
	if (!input.socketAddress) return false;
	if (input.trustedProxyConfiguration.trustedProxyCidrs.length === 0) return false;
	return isSocketPeerTrusted(
		canonicalizeIpAddress(input.socketAddress),
		input.trustedProxyConfiguration,
	);
}
