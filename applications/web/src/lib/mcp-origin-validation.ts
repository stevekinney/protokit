import { environment } from '@web/env';

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
		.filter((value) => value.length > 0);

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
