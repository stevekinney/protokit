import type { McpRegistry } from './scope-vocabulary.js';

/**
 * AUTHZ-001: the scopes an OAuth client can actually request and see
 * advertised, derived mechanically from the *production* registries
 * (`tools`/`resources`/`prompts` — never `conformanceOnlyTools`, which is
 * only ever registered when `enableConformanceMode` is on and is never
 * reachable through a real deployment's OAuth flow). Computing this from the
 * registry itself, rather than hand-maintaining a parallel list, is what
 * makes "authorization server and protected-resource metadata publish the
 * same supported scopes" mechanically true everywhere this is called from,
 * and what keeps a conformance-only fixture's scope out of production
 * metadata without a second place that has to remember to exclude it.
 *
 * The registry is an argument rather than a module import so that a
 * consumer's advertised `scopes_supported` describes the server it is
 * actually running. Reading module-level barrels here would have made this
 * answer this package's question no matter whose primitives were being
 * served, which is precisely the bug that made the package unusable as a
 * library.
 *
 * Sorted for a stable, deterministic `scope` string wherever this is joined
 * with a space (metadata `scopes_supported`, the `/mcp` 401 challenge's
 * `scope` attribute).
 */
export function getSupportedScopes(registry: McpRegistry): string[] {
	const scopes = new Set<string>();
	for (const tool of registry.tools) scopes.add(tool.requiredScope);
	for (const resource of registry.resources) scopes.add(resource.requiredScope);
	for (const prompt of registry.prompts) scopes.add(prompt.requiredScope);
	return [...scopes].sort();
}
