/**
 * OAUTH-004 / RFC 8252 §7.3: a native app's loopback redirect URI is
 * matched on scheme, loopback host, path, and query — but deliberately
 * NOT on port, because a native client (Claude Code, Codex) starts a local
 * HTTP listener on an ephemeral port chosen at runtime, after it already
 * registered a redirect URI. The authorization server "MUST allow any
 * port to be specified at the time of the request" for a redirect URI
 * that was registered without one, or that was registered with a
 * different port than the one actually used.
 *
 * Every other redirect URI (an HTTPS hosted callback, e.g. Claude's
 * `https://claude.ai/api/mcp/auth_callback`) is matched by exact string
 * equality against what the client registered — nothing about the
 * loopback carve-out below ever applies to `https:`.
 *
 * `[::1]` (IPv6 loopback) is treated as loopback here too, same as
 * `localhost`/`127.0.0.1` — RFC 8252 §7.3 names it explicitly, and the
 * comparison below already keeps every loopback host distinct from every
 * other one (`registered.hostname === requested.hostname`), so this adds a
 * third recognized loopback host rather than blurring the existing two.
 */

function isLoopbackRedirectUri(parsed: URL): boolean {
	return (
		parsed.protocol === 'http:' &&
		(parsed.hostname === 'localhost' ||
			parsed.hostname === '127.0.0.1' ||
			parsed.hostname === '[::1]')
	);
}

/**
 * Returns whether `requestedUri` — the `redirect_uri` presented on an
 * actual `/oauth/authorize` request — is one the client registered.
 *
 * `requestedUri` is checked with the same `isValidRedirectUri` rules
 * (`fragmentAndUserinfoFree`) applied to registration: a URI carrying a
 * fragment, embedded userinfo, or a wildcard host is rejected before it is
 * ever compared against a registered entry, exact or port-flexible.
 *
 * Review finding (P2): every candidate `registeredUris` entry is validated
 * the same way, not just `requestedUri`. A row written before this
 * validator existed (or written directly, bypassing `oauthRegistrationSchema`
 * /`client-metadata-documents.ts`'s own `isValidRedirectUri` refinement) can
 * still contain a fragment, embedded userinfo, or wildcard host. The
 * pre-existing `registeredUris.includes(requestedUri)` exact-match fast
 * path accepted such a value outright whenever the request repeated it
 * verbatim, and the port-flexible loopback loop parsed a stored candidate
 * with `new URL()` without ever running it through the validator either —
 * both let a legacy, never-validated registered value bypass this
 * hardening entirely. Filtering `registeredUris` through the same
 * validator before either comparison closes both paths at once.
 */
export function redirectUriMatchesRegistered(
	requestedUri: string,
	registeredUris: readonly string[],
	fragmentAndUserinfoFree: (uri: string) => boolean,
): boolean {
	if (!fragmentAndUserinfoFree(requestedUri)) return false;

	const validRegisteredUris = registeredUris.filter(fragmentAndUserinfoFree);

	if (validRegisteredUris.includes(requestedUri)) return true;

	let requested: URL;
	try {
		requested = new URL(requestedUri);
	} catch {
		return false;
	}

	if (!isLoopbackRedirectUri(requested)) return false;

	return validRegisteredUris.some((registeredUri) => {
		let registered: URL;
		try {
			registered = new URL(registeredUri);
		} catch {
			return false;
		}

		return (
			isLoopbackRedirectUri(registered) &&
			registered.hostname === requested.hostname &&
			registered.pathname === requested.pathname &&
			registered.search === requested.search
		);
	});
}
