/**
 * SEC-004: "normalize URLs once, reject fragments and user information
 * where forbidden." RFC 6749 §3.1.2 forbids a fragment component in a
 * redirect URI (the authorization server appends its own `code`/`state`
 * fragment-free; a client-supplied fragment would be silently dropped by
 * the user agent, hiding a mismatch). Embedded userinfo
 * (`https://trusted.com@evil.com/`) is a classic authority-confusion
 * vector — `evil.com` is the actual host, `trusted.com` is just a
 * username — so it is rejected outright rather than trusted to "look"
 * like the right domain.
 *
 * Review round 4: `http://[::1]` is accepted alongside `http://localhost`
 * and `http://127.0.0.1`. RFC 8252 §7.3 names IPv6 loopback (`::1`)
 * explicitly, and a native client bound to IPv6-only or IPv6-preferred
 * loopback has no other way to register a working redirect URI. This was a
 * gap, not a considered exclusion — the earlier `localhost`/`127.0.0.1`-only
 * scoping followed the roadmap bullet's literal wording without weighing
 * IPv6 against it.
 *
 * OAUTH-004: a `*` anywhere in the parsed hostname is rejected outright.
 * `new URL()` happily parses `https://*.example.com/cb` as a literal
 * hostname (confirmed directly — `*` is not a forbidden host code point
 * per the WHATWG URL spec), and nothing downstream ever treats `*` as a
 * glob, so a registered wildcard host would never actually match anything
 * at authorize time. It is rejected here anyway, at the boundary, rather
 * than left to rely on "well, nothing does glob matching" as the only
 * reason it's harmless — a future caller that DOES glob-match a stored
 * redirect URI should not inherit a wildcard nobody meant to be load-bearing.
 */
export function isValidRedirectUri(uri: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(uri);
	} catch {
		return false;
	}

	if (parsed.hash !== '' || parsed.username !== '' || parsed.password !== '') {
		return false;
	}

	if (parsed.hostname.includes('*')) {
		return false;
	}

	if (parsed.protocol === 'https:') return true;
	if (
		parsed.protocol === 'http:' &&
		(parsed.hostname === 'localhost' ||
			parsed.hostname === '127.0.0.1' ||
			parsed.hostname === '[::1]')
	)
		return true;
	return false;
}
