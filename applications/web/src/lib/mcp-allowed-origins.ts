/**
 * Pure, side-effect-free canonicalization for a single configured
 * `MCP_ALLOWED_ORIGINS` entry. No imports beyond the global `URL` --
 * shared by `mcp-origin-validation.ts` (the runtime allow-list this server
 * actually checks browser requests against) and
 * `production-startup-requirements.ts` (which must never import `@web/env`,
 * see that file's own doc comment, since it validates the real environment
 * at import time), so both call exactly one definition of "a valid
 * configured MCP origin" rather than drifting.
 *
 * Round-14 review finding (P2): a configured value was stored verbatim, so an
 * operator entering a syntactically valid but non-canonical origin form --
 * most commonly a trailing slash, e.g. `https://claude.ai/` copy-pasted from
 * a browser address bar -- silently produced an allow-list entry that could
 * never match. A real browser's `Origin` header is always the bare
 * `scheme://host[:port]` triple (`URL#origin`'s own definition): no
 * trailing slash, no path, no query, no fragment, no userinfo, and the
 * scheme/host normalized to lowercase. `new URL(value).origin` produces
 * exactly that canonical triple, so this parses each configured entry as a
 * URL and keeps its `.origin` rather than the raw text -- fixing the
 * trailing-slash case (and any future one, e.g. mismatched casing) as a
 * side effect of using the real definition instead of a literal string
 * compare.
 *
 * An entry that carries something an `Origin` header can never contain
 * (a real path, a query string, a fragment, embedded userinfo, or a
 * non-http(s) scheme) is a configuration mistake, not a stricter allow-list
 * -- keeping it verbatim would let it sit in the file forever looking
 * plausible while matching nothing, exactly the silent-lockout failure mode
 * that fix closes.
 */
export function canonicalizeConfiguredOrigin(rawValue: string): string | null {
	let url: URL;
	try {
		url = new URL(rawValue);
	} catch {
		return null;
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (url.username || url.password) return null;
	if (url.pathname !== '' && url.pathname !== '/') return null;
	if (url.search || url.hash) return null;

	return url.origin;
}

/** Splits a raw `MCP_ALLOWED_ORIGINS` value into its trimmed, nonempty entries -- the same tokenization `parseAllowedOrigins` and `production-startup-requirements.ts`'s startup check both need before canonicalizing each one. */
export function splitConfiguredOrigins(rawAllowedOrigins: string): string[] {
	return rawAllowedOrigins
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

/**
 * The list of configured `MCP_ALLOWED_ORIGINS` entries that
 * `canonicalizeConfiguredOrigin` could not parse into a real `Origin` --
 * empty when every entry is valid.
 *
 * Round-16 review finding (P2): `mcp-origin-validation.ts`'s
 * `parseAllowedOrigins` silently drops a malformed entry, so a nonempty
 * `MCP_ALLOWED_ORIGINS` containing only a malformed value (e.g.
 * `https://claude.ai/callback`, a real path an `Origin` header can never
 * carry) turns into an empty allow-list at runtime with no signal anywhere
 * -- the environment schema (`environment-schema.ts`) accepts any nonempty
 * string, `scripts/doctor.ts` never checked this variable at all before
 * this finding, and `setup.ts` writes the operator's typed value verbatim.
 * Production would start successfully and then reject every browser-origin
 * MCP request. This function is what makes that operator-visible: wired
 * into `production-startup-requirements.ts` (fails production startup
 * outright, converting the silent lockout into a boot-time error) and
 * `scripts/doctor.ts` (reports it to a developer before they ever deploy).
 * Lives in this dependency-free module (not `mcp-origin-validation.ts`,
 * which imports `@web/env`) for the same reason `canonicalizeConfiguredOrigin`
 * does -- `production-startup-requirements.ts` must never import `@web/env`.
 */
export function findInvalidConfiguredOrigins(rawAllowedOrigins: string): string[] {
	return splitConfiguredOrigins(rawAllowedOrigins).filter(
		(value) => canonicalizeConfiguredOrigin(value) === null,
	);
}
