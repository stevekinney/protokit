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
 * (`fragmentValidator`) applied to registration: a loopback URI carrying a
 * fragment or embedded userinfo is rejected before it is ever compared
 * against a registered entry, port-flexible or not. Without this, a
 * request like `http://127.0.0.1:9999/cb#frag` would satisfy a
 * scheme/host/path/query comparison against a fragment-free registered
 * entry and let a fragment ride along into the eventual redirect —
 * exactly the class of value registration already refuses to store.
 */
export function redirectUriMatchesRegistered(
	requestedUri: string,
	registeredUris: readonly string[],
	fragmentAndUserinfoFree: (uri: string) => boolean,
): boolean {
	if (registeredUris.includes(requestedUri)) return true;

	if (!fragmentAndUserinfoFree(requestedUri)) return false;

	let requested: URL;
	try {
		requested = new URL(requestedUri);
	} catch {
		return false;
	}

	if (!isLoopbackRedirectUri(requested)) return false;

	return registeredUris.some((registeredUri) => {
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
