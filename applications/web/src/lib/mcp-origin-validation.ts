import { environment } from '@web/env';

/**
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
 * this fix closes. Such an entry is dropped rather than guessed at, so a
 * malformed allow-list becomes visibly SMALLER (fails closed toward
 * rejecting more origins) instead of silently keeping a dead entry that
 * only ever appears to provide coverage it doesn't.
 */
function canonicalizeConfiguredOrigin(rawValue: string): string | null {
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

/**
 * SEC-002: pure and exported so unit tests can exercise every allow-list
 * shape (empty, single origin, multiple, whitespace) directly, instead of
 * `mock.module('@web/env', ...)` -- the pattern `OPEN-5` removed elsewhere
 * on this branch for exactly this reason (a per-file module mock is easy
 * to leak across files that share a module cache).
 */
export function parseAllowedOrigins(rawAllowedOrigins: string | undefined): Set<string> {
	const values = (rawAllowedOrigins ?? 'http://localhost:3000')
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0)
		.map((value) => canonicalizeConfiguredOrigin(value))
		.filter((value): value is string => value !== null);

	return new Set(values);
}

function currentAllowedOrigins(): Set<string> {
	return parseAllowedOrigins(environment.MCP_ALLOWED_ORIGINS);
}

/**
 * SEC-002: the browser cross-site request boundary for `/mcp`. Called
 * before any request body is read (see `authenticateMcpUser` in
 * `mcp-routes.ts`), so a disallowed origin is rejected without ever
 * touching the database, the rate limiter's post-parse buckets, or the
 * MCP SDK.
 */
export function validateMcpRequestOrigin(
	request: Request,
	allowedOrigins: Set<string> = currentAllowedOrigins(),
): { allowed: true } | { allowed: false } {
	const requestOrigin = request.headers.get('origin');

	// Non-browser clients commonly omit Origin; allow by default.
	if (!requestOrigin) {
		return { allowed: true };
	}

	// Sandboxed/null origins are not trusted for this server.
	if (requestOrigin === 'null') {
		return { allowed: false };
	}

	if (!allowedOrigins.has(requestOrigin)) {
		return { allowed: false };
	}

	return { allowed: true };
}

export function createMcpCorsHeaders(
	request: Request,
	allowedOrigins: Set<string> = currentAllowedOrigins(),
): Record<string, string> {
	const requestOrigin = request.headers.get('origin');
	if (!requestOrigin || requestOrigin === 'null' || !allowedOrigins.has(requestOrigin)) {
		return {};
	}

	return {
		'Access-Control-Allow-Origin': requestOrigin,
		Vary: 'Origin',
		'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
		'Access-Control-Allow-Headers':
			'Content-Type, Authorization, mcp-session-id, mcp-protocol-version, Last-Event-ID',
		'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
	};
}
