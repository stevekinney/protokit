import { defineScopes } from './scope-vocabulary.js';

/**
 * AUTHZ-001: this server's own OAuth scope vocabulary. It is now one
 * vocabulary among possibly several — `scope-vocabulary.ts` holds the
 * mechanism, and records which properties had to survive being opened to
 * consumers — but the reasoning behind these three is unchanged.
 *
 * The set is deliberately small and drawn straight from what the production
 * registries actually do; a "generic all-access scope" is exactly what the
 * roadmap says not to build. Every tool, resource, and prompt declares a
 * `requiredScope` from this set (`McpToolDefinition`/`McpResourceDefinition`/
 * `McpPromptDefinition` in `types/primitives.ts`), which is what turns "a
 * scope exists" into "every operation is gated by one."
 *
 * `audit:read` gates `list_audit_events`, a conformance-only fixture
 * (`CONTENT-001`/`META-001`) that is never registered in a production
 * deployment. It stays in the vocabulary — the tool still needs a real
 * `requiredScope` to satisfy the metadata contract and to be enforceable at
 * all when conformance mode is on — but `getSupportedScopes()` deliberately
 * excludes it from what a real OAuth client can ever request or see
 * advertised, because advertising a scope that only unlocks a fixture no
 * production deployment serves is exactly the "claims a capability it does
 * not implement" overclaiming this branch (`S-20`) exists to remove.
 *
 * The strings below are the consent-screen-facing descriptions, shown
 * verbatim on the authorize page so "the exact requested scopes" (the
 * roadmap's own phrase) is something a user can read rather than a raw
 * token. They are also what *declares* the vocabulary — a scope with no
 * description cannot be written here at all.
 */
export const templateScopeVocabulary = defineScopes({
	'profile:read': 'Read your profile information (name, email, avatar, role).',
	'audit:read': 'Read synthetic audit event history (protocol conformance testing only).',
	'prompts:read': 'Use this server’s prompt templates on your behalf.',
});

export type McpScope = (typeof templateScopeVocabulary.scopes)[number];

/**
 * The three exports below keep the exact shape every existing caller already
 * imports — `applications/web`'s authorize page renders
 * `mcpScopeDescriptions`, `oauth-scope.ts` narrows with `isMcpScope`, and
 * `request-limits.ts` sizes a bound against `mcpScopes`. Opening the
 * vocabulary changed how these are derived, not what they are.
 */
export const mcpScopes: readonly McpScope[] = templateScopeVocabulary.scopes;

export const mcpScopeDescriptions: Readonly<Record<McpScope, string>> =
	templateScopeVocabulary.descriptions;

export function isMcpScope(value: string): value is McpScope {
	return templateScopeVocabulary.isScope(value);
}

/**
 * Definers bound to this server's own vocabulary. The primitive files import
 * these rather than the unbound helpers in `types/primitives.js`, so a
 * mistyped scope fails on the primitive's own line — the same protection a
 * consumer gets from its own `defineScopes()` call, and the same philosophy
 * as `META-001` requiring `title` and `annotations` up front.
 */
export const { defineTool, defineResource, definePrompt } = templateScopeVocabulary;
