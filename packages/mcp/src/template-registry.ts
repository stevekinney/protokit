import type { McpRegistry } from './scope-vocabulary.js';
import type { McpScope } from './scopes.js';
import { allTools, conformanceOnlyTools } from './tools/index.js';
import { allResources } from './resources/index.js';
import { allPrompts } from './prompts/index.js';

/**
 * This repository's own registry, assembled from the barrels above.
 *
 * It exists because `createMcpServer` and `getSupportedScopes` now take a
 * registry rather than reaching for module-level constants, and this
 * repository is itself one of their consumers. A second consumer builds its
 * own `McpRegistry` and passes that instead — which is the whole point of
 * the change, and the reason the registry is a required argument rather
 * than one defaulting to this value. A default here would mean a consumer
 * that forgot to pass its own silently served `get_user_profile` in
 * production, and this package already holds the position that a wrong
 * default is worse than a missing one.
 */
export const templateRegistry: McpRegistry<McpScope> = {
	// Left unset so this registry keeps the bundled `instructions.md`, which
	// describes exactly these primitives. A consumer sets `instructions` to its
	// own text — see `McpRegistry`.
	tools: allTools,
	resources: allResources,
	prompts: allPrompts,
	conformanceOnlyTools,
};
