/**
 * Round 17 review finding: `Authorization: Bearer   <token>` (more than one
 * space between the scheme and the credential) was parsed by slicing at the
 * *first* space, so the surplus spaces stayed attached to the credential and
 * every comparison against the stored value failed. RFC 9110 §11.1 defines
 * the separator as `1*SP` — one or more spaces — so a compliant client was
 * being rejected.
 *
 * The reviewer also noted the parser was duplicated across `/mcp` and the
 * operator endpoints, which is the failure mode this pull request has hit
 * repeatedly: a fix lands on one path and its sibling keeps the defect. So
 * this is deliberately one shared parser both call sites import, not two
 * corrected copies.
 *
 * The scheme is returned verbatim; callers compare it case-insensitively
 * (RFC 9110 §11.1 registers scheme names case-insensitively). The credential
 * is returned verbatim and never trimmed — a bearer token's own characters
 * are case- and whitespace-sensitive, so a token carrying internal or
 * trailing whitespace must fail to match rather than be silently rewritten
 * into something that does.
 */
export function parseAuthorizationHeader(header: string | null | undefined): {
	scheme: string | undefined;
	credential: string | undefined;
} {
	if (!header) return { scheme: undefined, credential: undefined };
	const match = /^(\S+)[ \t]+([\s\S]*)$/.exec(header);
	if (!match) return { scheme: undefined, credential: undefined };
	return { scheme: match[1], credential: match[2] };
}

/**
 * Convenience wrapper for the overwhelmingly common case: extract the
 * credential only when the scheme is `bearer`, in any casing.
 */
export function parseBearerCredential(header: string | null | undefined): string | undefined {
	const { scheme, credential } = parseAuthorizationHeader(header);
	return scheme?.toLowerCase() === 'bearer' ? credential : undefined;
}
