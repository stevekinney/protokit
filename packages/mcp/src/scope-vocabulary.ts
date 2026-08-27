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
	/**
	 * Builds a registry pinned to this vocabulary.
	 *
	 * Use this rather than writing an object literal and letting `McpRegistry`
	 * default `Scope` to `string`. An inferred registry accepts a primitive
	 * from an unbound definer or from a *different* vocabulary with no type
	 * error, and `getSupportedScopes()` then advertises a scope this
	 * vocabulary has no description for and whose `isScope()` returns false —
	 * so the authorization layer cannot issue the scope the served primitive
	 * requires. Annotating the registry by hand also prevents that, but only
	 * if the author remembers to; this makes the binding the default path.
	 */
	defineRegistry(registry: McpRegistry<Scope>): McpRegistry<Scope>;
};

/**
 * Recursively freezes plain data — objects and arrays — leaving everything
 * else by reference.
 *
 * This exists because freezing one level at a time has been wrong three times
 * on this change: the descriptions map, then the scope array, then tool
 * annotations, each fixed alone while the level inside or outside it stayed
 * mutable. The rule that actually holds is "anything plain that a consumer can
 * still reach is frozen all the way down", so it is written once here rather
 * than re-derived per field.
 *
 * It stops at anything that is not a plain object or array — Zod schemas carry
 * internal state that freezing would break, and a handler closure cannot be
 * frozen meaningfully. Those are genuinely not snapshot-able, and freezing
 * them would be a guarantee that reads stronger than it is.
 */
function deepFreezePlainData<Value>(value: Value): Value {
	if (Array.isArray(value)) {
		for (const entry of value) deepFreezePlainData(entry);
		return Object.freeze(value) as Value;
	}
	// `Object.getPrototypeOf` rather than `typeof`: a class instance, a Zod
	// schema, a Map, a Date are all `'object'` and none should be frozen here.
	if (
		typeof value === 'object' &&
		value !== null &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
	) {
		for (const entry of Object.values(value as Record<string, unknown>)) {
			deepFreezePlainData(entry);
		}
		return Object.freeze(value) as Value;
	}
	return value;
}

/**
 * The scope names a descriptions object actually yields at runtime.
 *
 * `Object.keys()` stringifies every key, so `{ 123: '...' }` produces the
 * scope `'123'`. Taking only `Extract<keyof D, string>` would discard that
 * numeric literal and type the vocabulary as `McpScopeVocabulary<never>` —
 * its bound definers would reject `requiredScope: '123'` even though
 * `isScope('123')` returns true at runtime. Templating the numeric keys back
 * to strings keeps the type and the runtime describing the same set.
 */
type ScopeOf<Descriptions> =
	Extract<keyof Descriptions, string> | `${Extract<keyof Descriptions, number>}`;

/**
 * Builds a vocabulary from its consent-screen descriptions.
 *
 * The descriptions map is deliberately the **single source** of the
 * vocabulary rather than a second declaration checked against a scope list.
 * A scope with no description then cannot be expressed at all, instead of
 * being a runtime check or a blank line on someone's consent screen — the
 * failure is structural rather than something a test has to catch.
 */
/**
 * RFC 6749 section 3.3: `scope-token = 1*( %x21 / %x23-5B / %x5D-7E )` —
 * printable ASCII excluding space, double quote, and backslash.
 *
 * This is validated rather than trusted because every one of those three
 * exclusions is load-bearing downstream, not stylistic. `getSupportedScopes()`
 * joins scopes with a space into `scopes_supported` and the `/mcp` 401
 * challenge, so a scope containing a space parses back as *two* scopes while
 * the primitive still requires the single original string — leaving that
 * primitive impossible to authorize, with nothing anywhere reporting an
 * error. A double quote or backslash escapes the quoted `scope="..."` value in
 * the `WWW-Authenticate` challenge, and control characters corrupt it.
 */
const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;

export function defineScopes<
	const Descriptions extends Record<string, string> & {
		/**
		 * `__proto__` cannot be a scope name, and this rejects it where it is
		 * written rather than letting it vanish. In an object literal the key
		 * is special: it never becomes an own property, so `Object.keys()`
		 * would return nothing while TypeScript still infers it as a member of
		 * `Scope`. The bound definers would then accept primitives requiring a
		 * scope that `scopes` omits and `isScope()` rejects — unauthorizable,
		 * with no error anywhere. No runtime read can recover the key, so the
		 * type is the only place this can be caught.
		 */
		__proto__?: never;
	},
>(descriptions: Descriptions): McpScopeVocabulary<ScopeOf<Descriptions>> {
	type Scope = ScopeOf<Descriptions>;
	// Frozen for the same reason as the descriptions and the registry: a
	// statically `readonly` array is still mutable at runtime for a JavaScript
	// consumer or a TypeScript one crossing an untyped boundary. A `push` or
	// `splice` here would leave `scopes` disagreeing with the `membership` set
	// and the frozen descriptions captured alongside it, so OAuth code
	// iterating it could advertise a scope `isScope()` rejects, or omit one it
	// accepts. `mcpScopes` aliases this array directly.
	const scopes = Object.freeze(Object.keys(descriptions)) as readonly Scope[];

	if (scopes.length === 0) {
		throw new Error(
			'defineScopes() was given no scopes. If the object literal looked non-empty, check for ' +
				'a key that does not become an own property — `__proto__` is the one that does this.',
		);
	}

	for (const scope of scopes) {
		if (!SCOPE_TOKEN.test(scope)) {
			throw new Error(
				`Invalid OAuth scope token ${JSON.stringify(scope)}: a scope must match RFC 6749's ` +
					'`scope-token` (printable ASCII, no space, double quote, or backslash). A scope ' +
					'containing a space would be re-parsed as two scopes wherever scopes are ' +
					'space-delimited, leaving the primitive that requires it impossible to authorize.',
			);
		}
		// The type says `string`, which does not exclude the empty or
		// whitespace-only string. Without this, the "declaring scopes through
		// descriptions makes a blank consent line impossible" guarantee is only
		// true of a *missing* description, not an empty one.
		if (descriptions[scope].trim() === '') {
			throw new Error(
				`Scope ${JSON.stringify(scope)} has a blank description. The consent screen renders ` +
					'this text verbatim, so a blank value shows the user an unexplained grant.',
			);
		}
	}

	const membership = new Set<string>(scopes);

	// Snapshot and freeze rather than exposing the caller's object. Returning a
	// readonly *cast* of the input leaves the caller holding a live alias: it
	// can blank a description after validation, or add and delete keys so
	// `descriptions` disagrees with the `scopes` and membership captured here.
	// Every check above would have passed and none of them would still hold.
	const frozenDescriptions = deepFreezePlainData({ ...descriptions }) as Readonly<
		Record<Scope, string>
	>;

	/**
	 * The type binding holds only when the descriptions are a literal. Given a
	 * widened `Record<string, string>` — configuration assembled or loaded
	 * before the call — `Scope` degrades to `string` and the definers below
	 * would accept any `requiredScope`, including a typo or a scope absent
	 * from this vocabulary entirely. `defineRegistry()` inherits the same
	 * widened type and cannot recover it either.
	 *
	 * So membership is checked at runtime as well. The type catches the typo
	 * on the primitive's own line where it can; this catches it at
	 * construction where the type cannot.
	 */
	/**
	 * Freezes a tool definition and the plain-data objects it hands to
	 * `registerTool`.
	 *
	 * A shallow freeze is not enough, and my earlier note calling it "shallow
	 * by intent" reasoned about the wrong thing — what `assertDeclared`
	 * validated, rather than what the snapshot protects. `annotations` is the
	 * clearest case: a caller retaining that object can flip `readOnlyHint` or
	 * `destructiveHint` after `defineRegistry()` returns, and the same object
	 * reaches the client, so a tool can advertise safety metadata the registry
	 * never validated. Those hints are read by a model deciding whether a call
	 * is safe, which makes them worth more protection than the scope, not
	 * less. `_meta` gets the same treatment for the same reason.
	 *
	 * It stops at the Zod schemas and the handler deliberately: schemas carry
	 * internal state that freezing would break, and a closure cannot be frozen
	 * meaningfully. Those are not snapshot-able, and pretending otherwise
	 * would be the kind of guarantee that reads stronger than it is.
	 */
	function structuredCloneish<Value>(value: Value): Value {
		if (Array.isArray(value)) return value.map(structuredCloneish) as Value;
		if (
			typeof value === 'object' &&
			value !== null &&
			(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
		) {
			return Object.fromEntries(
				Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
					key,
					structuredCloneish(entry),
				]),
			) as Value;
		}
		return value;
	}

	function freezeToolDefinition<Definition extends { annotations?: unknown; _meta?: unknown }>(
		definition: Definition,
	): Definition {
		return Object.freeze({
			...definition,
			// Deep, not shallow: the documented MCP Apps `_meta` shape is nested
			// (`{ ui: { resourceUri, visibility } }`), so a shallow copy leaves
			// `ui` aliased and a caller could still hide a tool from the model or
			// redirect its UI resource after validation.
			...(definition.annotations
				? { annotations: deepFreezePlainData(structuredCloneish(definition.annotations)) }
				: {}),
			...(definition._meta
				? { _meta: deepFreezePlainData(structuredCloneish(definition._meta)) }
				: {}),
		});
	}

	function assertDeclared<Definition extends { name: string; requiredScope: string }>(
		definition: Definition,
	): Definition {
		if (!membership.has(definition.requiredScope)) {
			throw new Error(
				`${definition.name} requires scope ${JSON.stringify(definition.requiredScope)}, which ` +
					`this vocabulary does not declare. Declared: ${scopes.join(', ')}.`,
			);
		}
		return definition;
	}

	// The container too, not only its contents. Freezing `scopes` while leaving
	// the object holding it mutable let `vocabulary.scopes = [...]` succeed —
	// the same guarantee defeated one level out, which is the mistake this
	// whole family kept repeating.
	return Object.freeze({
		scopes,
		descriptions: frozenDescriptions,
		isScope(value: string): value is Scope {
			return membership.has(value);
		},
		defineTool: (definition) => assertDeclared(definition),
		defineResource: (definition) => assertDeclared(definition),
		definePrompt: (definition) => assertDeclared(definition),
		defineRegistry: (registry) => {
			for (const tool of registry.tools) assertDeclared(tool);
			for (const resource of registry.resources) assertDeclared(resource);
			for (const prompt of registry.prompts) assertDeclared(prompt);
			for (const tool of registry.conformanceOnlyTools ?? []) assertDeclared(tool);
			// Same live-alias problem as the descriptions, one layer out.
			// Returning the caller's object lets them push a primitive onto an
			// array, or reassign a retained definition's `requiredScope`, after
			// validation — and `getSupportedScopes()` and `createMcpServer()`
			// then consume the unvalidated result. Copying the arrays and
			// freezing the definitions makes the validated shape the one that
			// actually gets served. Freezing is shallow by intent: it pins
			// `requiredScope` and `name`, which is what was validated, without
			// pretending to freeze handler closures.
			return Object.freeze({
				...registry,
				tools: Object.freeze(registry.tools.map(freezeToolDefinition)),
				resources: Object.freeze(registry.resources.map((resource) => Object.freeze(resource))),
				prompts: Object.freeze(registry.prompts.map((prompt) => Object.freeze(prompt))),
				...(registry.conformanceOnlyTools
					? {
							conformanceOnlyTools: Object.freeze(
								registry.conformanceOnlyTools.map(freezeToolDefinition),
							),
						}
					: {}),
			});
		},
	});
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
	/**
	 * Natural-language server instructions, handed to the MCP client and fed
	 * straight to a model. Optional only so this repository's own registry can
	 * keep using the bundled `instructions.md`; **a consumer should always set
	 * it.**
	 *
	 * Serving one registry's instructions alongside another's primitives is
	 * worse than unhelpful. The bundled text names `get_user_profile`,
	 * `user://profile`, and `summarize`, points at this template's OAuth
	 * endpoints, and states that no operation is destructive. A consumer that
	 * inherits it hands a model a description of tools that do not exist — and,
	 * far more seriously, an assurance that its own mutating tools are
	 * read-only.
	 */
	readonly instructions?: string;
	/**
	 * The implementation identity reported in the `initialize` response.
	 *
	 * Optional only so this repository's own registry keeps deriving its name
	 * from `MCP_SERVER_NAME`; **a consumer should always set it.** Without it a
	 * consumer's server reports this package's name and version, so clients and
	 * operators misattribute it in diagnostics, and any client behaviour keyed
	 * to `serverInfo` — compatibility shims, version gates — reads the wrong
	 * implementation entirely.
	 */
	readonly serverInfo?: { readonly name: string; readonly version: string };
	readonly tools: readonly McpToolDefinition<z.ZodType, z.ZodType | undefined, Scope>[];
	readonly resources: readonly McpResourceDefinition<Scope>[];
	readonly prompts: readonly McpPromptDefinition<Record<string, z.ZodType> | undefined, Scope>[];
	readonly conformanceOnlyTools?: readonly McpToolDefinition<
		z.ZodType,
		z.ZodType | undefined,
		Scope
	>[];
};
