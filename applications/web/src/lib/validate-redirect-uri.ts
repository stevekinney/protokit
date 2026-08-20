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

	if (parsed.protocol === 'https:') return true;
	if (
		parsed.protocol === 'http:' &&
		(parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
	)
		return true;
	return false;
}
