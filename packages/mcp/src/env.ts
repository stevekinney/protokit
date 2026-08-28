import { z } from 'zod';

import { mcpServerEnvironmentSchema } from './environment-schema.js';

export type McpServerEnvironment = z.infer<z.ZodObject<typeof mcpServerEnvironmentSchema>>;

const mcpServerEnvironmentObject = z.object(mcpServerEnvironmentSchema);

/**
 * Parses a raw environment record into a validated `McpServerEnvironment`.
 *
 * A function taking the environment as an argument, rather than a
 * module-scope side effect reading `process.env` on import. Importing this
 * package must not impose its environment contract on the host before the
 * host has decided it wants a server at all — a library that throws during
 * module evaluation takes the whole import graph down with it, and a
 * consumer has no way to catch that or to supply a different environment.
 *
 * CONFIG-001 / BUG-001: an empty string is treated as unset. Otherwise a
 * variable that is declared but left blank behaves differently from one
 * never set at all — it bypasses `.default()` and, for a numeric field,
 * coerces to `0` rather than `NaN`. This is why the environment is
 * filtered here rather than handed to Zod directly.
 */
export function parseMcpServerEnvironment(
	env: Record<string, string | undefined>,
): McpServerEnvironment {
	// CONFIG-001 / BUG-001: the escape hatch is refused everywhere rather
	// than gated on `NODE_ENV`, so setting it anywhere fails loudly instead
	// of being silently ignored in the environments that matter. Checked
	// against the passed-in record, not `process.env`, so it stays enforced
	// without reintroducing an import-time read.
	if (env.SKIP_ENV_VALIDATION) {
		throw new Error(
			'SKIP_ENV_VALIDATION is not supported. Supply a real environment instead — see .env.example.',
		);
	}

	const presentEntries: Record<string, string> = Object.fromEntries(
		Object.entries(env).filter(
			(entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '',
		),
	);

	const environment = mcpServerEnvironmentObject.parse(presentEntries);

	// OBS-001: the same fail-closed shape as the `SKIP_ENV_VALIDATION`
	// refusal above. A schema `.refine()` cannot express this — the schema
	// shape is shared, side-effect-free, and deliberately has no cross-field
	// checks — so it is enforced imperatively, once, immediately after
	// validation. A diagnostic timestamp is legitimate in development and
	// test; only production refuses it outright, regardless of how near the
	// timestamp is, because raw prompt content must never be logged there.
	if (environment.NODE_ENV === 'production' && environment.LOG_CONTENT_DIAGNOSTICS_UNTIL) {
		throw new Error(
			'LOG_CONTENT_DIAGNOSTICS_UNTIL is not supported in production. Raw prompt content logging cannot run in production.',
		);
	}

	return environment;
}

let cachedEnvironment: McpServerEnvironment | undefined;

/**
 * Lazily parses and memoizes `process.env` on first access.
 *
 * Every internal caller goes through this rather than through a
 * module-scope constant, so the first read happens when something actually
 * needs a value — not when the module is loaded. Callers that need a fresh
 * read against a mutated `process.env` (tests, primarily) should call
 * `parseMcpServerEnvironment(process.env)` directly.
 */
export function getEnvironment(): McpServerEnvironment {
	cachedEnvironment ??= parseMcpServerEnvironment(process.env);
	return cachedEnvironment;
}
