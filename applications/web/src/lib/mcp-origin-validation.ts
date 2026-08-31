import { canonicalizeConfiguredOrigin, splitConfiguredOrigins } from '@web/lib/mcp-allowed-origins';

/**
 * SEC-002: pure and exported so unit tests can exercise every allow-list
 * shape (empty, single origin, multiple, whitespace) directly, instead of
 * `mock.module('@web/env', ...)` -- the pattern `OPEN-5` removed elsewhere
 * on this branch for exactly this reason (a per-file module mock is easy
 * to leak across files that share a module cache).
 *
 * Round-16 review finding (P2): a malformed entry (one
 * `canonicalizeConfiguredOrigin` cannot parse into a real `Origin`) used to
 * be silently filtered out here, so a configured value like
 * `https://claude.ai/callback` (a real path, which an `Origin` header can
 * never carry) turned a nonempty `MCP_ALLOWED_ORIGINS` into an empty
 * allow-list with no signal anywhere -- the environment schema accepts any
 * nonempty string (`environment-schema.ts`), `scripts/doctor.ts` never
 * checked this variable at all before this fix, and `setup.ts` writes the
 * operator's typed value verbatim. Production would start successfully and
 * then reject every browser-origin MCP request, with the only evidence
 * being a wall of 403s in the request log. This function itself stays
 * pure and permissive (it still returns whatever canonicalizes, dropping
 * what doesn't) -- fixing this at the point of use here would either make
 * every allow-list lookup capable of throwing (turning a browser CORS
 * preflight into a 500) or require this function to also own "fail
 * closed," which is a startup-time decision, not a per-request one. The
 * fail-closed enforcement lives at startup instead: `mcp-allowed-origins.ts`'s
 * `findInvalidConfiguredOrigins` is wired into
 * `production-startup-requirements.ts` (so production refuses to start
 * with a malformed entry, converting the silent lockout into a boot-time
 * error) and into `scripts/doctor.ts`'s schema-driven checks (so a
 * developer sees it before ever deploying), closing the exact gap this
 * finding names.
 */
export function parseAllowedOrigins(rawAllowedOrigins: string | undefined): Set<string> {
	const values = splitConfiguredOrigins(rawAllowedOrigins ?? 'http://localhost:3000')
		.map((value) => canonicalizeConfiguredOrigin(value))
		.filter((value): value is string => value !== null);

	return new Set(values);
}
