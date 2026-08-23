/**
 * AUTHZ-001: the server's entire OAuth scope vocabulary, in one place. This
 * is deliberately small and drawn straight from what the production
 * registries actually do — a "generic all-access scope" is exactly what the
 * roadmap says not to build. Every tool, resource, and prompt declares a
 * `requiredScope` from this set (`McpToolDefinition`/`McpResourceDefinition`/
 * `McpPromptDefinition` in `types/primitives.ts`), which is what turns "a
 * scope exists" into "every operation is gated by one."
 *
 * `audit:read` gates `list_audit_events`, a conformance-only fixture
 * (`CONTENT-001`/`META-001`) that is never registered in a production
 * deployment. It stays in the vocabulary — the tool still needs a real
 * `requiredScope` to satisfy the metadata contract and to be enforceable at
 * all when conformance mode is on — but `getSupportedScopes()` below
 * deliberately excludes it from what a real OAuth client can ever request or
 * see advertised, because advertising a scope that only unlocks a fixture no
 * production deployment serves is exactly the "claims a capability it does
 * not implement" overclaiming this branch (`S-20`) exists to remove.
 */
export const mcpScopes = ['profile:read', 'audit:read', 'prompts:read'] as const;

export type McpScope = (typeof mcpScopes)[number];

export function isMcpScope(value: string): value is McpScope {
	return (mcpScopes as readonly string[]).includes(value);
}

/**
 * Human-readable, consent-screen-facing description of what granting a
 * scope actually allows. Shown verbatim on the authorize page so "the exact
 * requested scopes" (the roadmap's own phrase) is something a user can read,
 * not just a raw token string.
 */
export const mcpScopeDescriptions: Record<McpScope, string> = {
	'profile:read': 'Read your profile information (name, email, avatar, role).',
	'audit:read': 'Read synthetic audit event history (protocol conformance testing only).',
	'prompts:read': 'Use this server’s prompt templates on your behalf.',
};
