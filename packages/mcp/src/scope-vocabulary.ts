import type { z } from 'zod';
import type {
	McpPromptDefinition,
	McpResourceDefinition,
	McpToolDefinition,
} from './types/primitives.js';

/**
 * AUTHZ-001: a consumer's OAuth scope vocabulary, closed per consumer rather
 * than closed to one set globally. The properties the original fixed
 * vocabulary carried are the ones that have to survive being opened:
 *
 * - Every primitive declares **exactly one** scope from this set. Opening the
 *   vocabulary must not open that, so `requiredScope` stays a single value of
 *   `Scope` — never an array, never optional.
 * - There is no generic all-access scope, and none can be expressed. The
 *   authorization check is exact membership (`grantedScopes.includes(...)`),
 *   so a token granted `'*'` authorizes nothing. Widening happens only on the
 *   declaration side; the granted side stays `readonly string[]`.
 * - Conformance-only scopes are excluded from `getSupportedScopes()`
 *   structurally, by walking the production registries alone, not by a second
 *   exclusion list somebody has to remember to update.
 */
export type McpScopeVocabulary<Scope extends string> = {
	/** Every scope in the vocabulary, in declaration order. */
	readonly scopes: readonly Scope[];
	/** Consent-screen text, shown verbatim on the authorize page. */
	readonly descriptions: Readonly<Record<Scope, string>>;
	/** Narrowing check against this vocabulary rather than a fixed list. */
	isScope(value: string): value is Scope;
	/**
	 * Definers bound to this vocabulary. Using these rather than the bare
	 * ones from `types/primitives.js` is what puts a mistyped scope on the
	 * primitive's own line: an unbound `defineTool` infers `Scope` from
	 * whatever literal it is given, so `'reposotories:read'` type-checks
	 * there and only fails later at registry assignment, far from the
	 * mistake. Same reasoning as `META-001` requiring `title` and
	 * `annotations` — a compile error on the file you are editing beats one
	 * a reviewer has to trace.
	 */
	defineTool<InputSchema extends z.ZodType, OutputSchema extends z.ZodType | undefined = undefined>(
		definition: McpToolDefinition<InputSchema, OutputSchema, Scope>,
	): McpToolDefinition<InputSchema, OutputSchema, Scope>;
	defineResource(definition: McpResourceDefinition<Scope>): McpResourceDefinition<Scope>;
	definePrompt<Arguments extends Record<string, z.ZodType> | undefined>(
		definition: McpPromptDefinition<Arguments, Scope>,
	): McpPromptDefinition<Arguments, Scope>;
};

/**
 * Builds a vocabulary from its consent-screen descriptions.
 *
 * The descriptions map is deliberately the **single source** of the
 * vocabulary rather than a second declaration checked against a scope list.
 * A scope with no description then cannot be expressed at all, instead of
 * being a runtime check or a blank line on someone's consent screen — the
 * failure is structural rather than something a test has to catch.
 */
export function defineScopes<const Descriptions extends Record<string, string>>(
	descriptions: Descriptions,
): McpScopeVocabulary<Extract<keyof Descriptions, string>> {
	type Scope = Extract<keyof Descriptions, string>;
	const scopes = Object.keys(descriptions) as Scope[];
	const membership = new Set<string>(scopes);

	return {
		scopes,
		descriptions: descriptions as Readonly<Record<Scope, string>>,
		isScope(value: string): value is Scope {
			return membership.has(value);
		},
		defineTool: (definition) => definition,
		defineResource: (definition) => definition,
		definePrompt: (definition) => definition,
	};
}

/**
 * The primitives a server serves, supplied by whoever is building it.
 *
 * `conformanceOnlyTools` is separate rather than a flag on a tool because the
 * separation is what `getSupportedScopes()` reads: it walks the production
 * three and never this one, so a scope declared only by a conformance fixture
 * cannot reach a real OAuth client. Collapsing them into one list with a
 * boolean would move that guarantee from the shape of the data into a filter
 * somebody can forget.
 *
 * Note there is no conformance-only slot for resources or prompts, and that
 * is not an oversight: the protocol conformance fixtures registered by
 * `registerConformanceFixtures()` are imperative and declare no
 * `requiredScope`, so they never participate in the scope vocabulary at all.
 */
export type McpRegistry<Scope extends string = string> = {
	readonly tools: readonly McpToolDefinition<z.ZodType, z.ZodType | undefined, Scope>[];
	readonly resources: readonly McpResourceDefinition<Scope>[];
	readonly prompts: readonly McpPromptDefinition<Record<string, z.ZodType> | undefined, Scope>[];
	readonly conformanceOnlyTools?: readonly McpToolDefinition<
		z.ZodType,
		z.ZodType | undefined,
		Scope
	>[];
};
