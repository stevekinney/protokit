import { getSupportedScopes } from '@template/mcp';

/**
 * AUTHZ-001: parses and validates an OAuth `scope` request parameter
 * against this server's own supported vocabulary (`@template/mcp`'s
 * production-registry-derived `getSupportedScopes()` — never the full
 * `mcpScopes` vocabulary, which also contains the conformance-only
 * `audit:read` no real client can ever be granted).
 *
 * RFC 6749 §3.3 lets an authorization server "process the request using a
 * pre-defined default value" when a client omits `scope` entirely. This
 * server's pre-defined default is the full supported set — every current
 * operation requires roughly the same access today, every documented
 * connector (Claude, Codex, ChatGPT) is expected to omit `scope` on its
 * authorize request, and "keep server-wide authentication explicit... do
 * not claim anonymous or optional authentication accidentally" (this
 * item's own roadmap wording) argues against silently defaulting to *no*
 * access instead. A client that wants less than the default set says so
 * explicitly, and gets exactly that — never more than it asked for.
 */
export type ParsedScopeRequest =
	{ ok: true; scopes: string[] } | { ok: false; error: 'invalid_scope'; unknownScopes: string[] };

/** Deterministic, deduplicated, space-delimited `scope` string for storage/display/comparison. */
export function canonicalizeScopes(scopes: readonly string[]): string {
	return [...new Set(scopes)].sort().join(' ');
}

export function splitScopeString(scope: string): string[] {
	return scope.split(/\s+/).filter((token) => token.length > 0);
}

export function parseRequestedScope(rawScope: string | null): ParsedScopeRequest {
	const supportedScopes = getSupportedScopes();

	if (!rawScope || rawScope.trim().length === 0) {
		return { ok: true, scopes: supportedScopes };
	}

	const requestedScopes = splitScopeString(rawScope);
	const unknownScopes = requestedScopes.filter((scope) => !supportedScopes.includes(scope));
	if (unknownScopes.length > 0) {
		return { ok: false, error: 'invalid_scope', unknownScopes };
	}

	return { ok: true, scopes: [...new Set(requestedScopes)] };
}

/** Whether every scope in `requested` is already present in `granted` — used to reject a refresh request that tries to escalate. */
export function isScopeSubsetOf(requested: readonly string[], granted: readonly string[]): boolean {
	return requested.every((scope) => granted.includes(scope));
}

/**
 * AUTHZ-001 / RFC 6749 §6: unlike `/oauth/authorize`, an omitted `scope` on
 * a refresh request means "keep the refresh token's own scope" -- there is
 * no "full default set" here, because a client that never asked to narrow
 * anything is not asking to widen anything either. `scope: undefined`
 * (distinct from `scope: []`) is exactly that "caller did not ask to
 * change anything" signal; the token endpoint carries the stored scope
 * forward unchanged when it sees this.
 */
export type ParsedRefreshScopeRequest =
	| { ok: true; scope: string[] | undefined }
	| { ok: false; error: 'invalid_scope'; unknownScopes: string[] };

export function parseRefreshScopeRequest(rawScope: string | undefined): ParsedRefreshScopeRequest {
	if (rawScope === undefined || rawScope.length === 0) {
		return { ok: true, scope: undefined };
	}

	const supportedScopes = getSupportedScopes();
	const requestedScopes = splitScopeString(rawScope);
	const unknownScopes = requestedScopes.filter((scope) => !supportedScopes.includes(scope));
	if (unknownScopes.length > 0) {
		return { ok: false, error: 'invalid_scope', unknownScopes };
	}

	return { ok: true, scope: [...new Set(requestedScopes)] };
}
