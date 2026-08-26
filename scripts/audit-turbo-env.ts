#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Review finding (P2, `turbo.json:50`): `turbo.json`'s `globalEnv` is what
 * makes Turbo hash the `test` (and other cached) tasks per environment
 * configuration. A runtime environment variable that a package's `env.ts`
 * actually reads but that is missing from `globalEnv` can let Turbo serve a
 * cached result produced under a DIFFERENT value of that variable, and in
 * Turbo's strict environment mode an omitted variable can also be absent
 * from the task's process entirely. This audit is the prevention mechanism
 * for that class of drift recurring: every `environment-schema.ts` in the
 * repository is the single source of truth for what a package actually
 * reads, so this derives the expected set from those files rather than
 * restating them, the same "derive, don't restate" rule `DX-001`'s `doctor`
 * follows for the same schemas.
 *
 * Previously this derived the set by regex-matching literal
 * `process.env.KEY` / `process.env['KEY']` reads inside each `env.ts`. The
 * `@lostgradient/environmentalist` migration replaced those literal reads
 * with a dynamic `Object.entries(process.env)` enumeration (see
 * `applications/web/src/build.ts` for why that's load-bearing on its own),
 * which made that regex match nothing and silently turned this audit into
 * a no-op that always reported success. Environmentalist derives each
 * variable's name from the schema's own key (`BASE_URL` in the schema is
 * read from `BASE_URL` in the environment), so `environment-schema.ts` is
 * now the thing this audit parses instead.
 */

/** Repo-relative paths of every `environment-schema.ts` this audit checks, one per package with a validated environment. */
export const ENV_SCHEMA_FILE_PATHS: readonly string[] = [
	'applications/web/src/environment-schema.ts',
	'packages/mcp/src/environment-schema.ts',
	'packages/database/src/environment-schema.ts',
];

/**
 * Three variables `applications/web/src/env.ts` consults directly from the
 * real OS environment (Railway's replica identifiers, and the generic
 * `HOSTNAME`) to derive the `railwayReplicaIdentifier`/`hostnameIdentifier`
 * schema fields — see that file's `env` object construction. They are not
 * schema keys themselves (there is no `z.object()` field named
 * `RAILWAY_REPLICA_ID`), so `extractSchemaKeyNames` can never find them;
 * listed explicitly here so the audit still catches them dropping out of
 * `turbo.json`'s `globalEnv`.
 */
export const EXTRA_RUNTIME_ENV_VAR_NAMES: readonly string[] = [
	'RAILWAY_REPLICA_ID',
	'RAILWAY_INSTANCE_ID',
	'HOSTNAME',
];

/**
 * The two web schema fields `RAILWAY_REPLICA_ID`/`RAILWAY_INSTANCE_ID`/
 * `HOSTNAME` above feed into — `railwayReplicaIdentifier`'s and
 * `hostnameIdentifier`'s canonical keys derive the schema names
 * `RAILWAY_REPLICA_IDENTIFIER` and `HOSTNAME_IDENTIFIER`, which
 * `extractSchemaKeyNames` finds like any other field, but neither is ever
 * read from the real environment under its own name — only the three
 * `EXTRA_RUNTIME_ENV_VAR_NAMES` above are. Excluded here for the same
 * reason `findMissingGlobalEnvVars` excludes `SKIP_ENV_VALIDATION`: it is
 * not a configuration value any cached task's output can vary by on its
 * own, and `turbo.json`'s `globalEnv` has never listed it.
 */
export const DERIVED_ONLY_SCHEMA_KEYS: readonly string[] = [
	'RAILWAY_REPLICA_IDENTIFIER',
	'HOSTNAME_IDENTIFIER',
];

/**
 * Extracts every top-level key of an `environment-schema.ts` file's
 * exported Zod shape object — each one is the exact environment-variable
 * name Environmentalist derives that field's canonical camelCase key from,
 * since every schema in this repository already spells its keys in
 * `SCREAMING_SNAKE_CASE`. Deliberately regex-based rather than a real
 * parse: matches a `\tKEY: ` line, which is exactly the shape of every
 * top-level entry in these hand-written, single-level shape objects.
 */
export function extractSchemaKeyNames(source: string): string[] {
	const names = new Set<string>();
	const keyLine = /^\t([A-Z][A-Z0-9_]*):/gm;
	for (const match of source.matchAll(keyLine)) {
		names.add(match[1]!);
	}
	return [...names].sort();
}

/** Every declared entry in `turbo.json`'s top-level `globalEnv` array. */
export function extractGlobalEnvVarNames(turboJsonSource: string): string[] {
	const parsed = JSON.parse(turboJsonSource) as { globalEnv?: unknown };
	if (!Array.isArray(parsed.globalEnv)) {
		throw new Error('turbo.json has no top-level globalEnv array.');
	}
	return parsed.globalEnv.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Every variable at least one `env.ts` reads that `turbo.json`'s
 * `globalEnv` does not declare. `SKIP_ENV_VALIDATION` is excluded on
 * purpose — every `env.ts` checks it only to throw if it is set (it was
 * removed as a real escape hatch by `CONFIG-001`/`BUG-001`), so it is not a
 * configuration value any cached task's output can vary by.
 */
export function findMissingGlobalEnvVars(
	runtimeEnvVarNames: readonly string[],
	globalEnvVarNames: readonly string[],
): string[] {
	const declared = new Set(globalEnvVarNames);
	return runtimeEnvVarNames
		.filter((name) => name !== 'SKIP_ENV_VALIDATION')
		.filter((name) => !declared.has(name))
		.sort();
}

async function runAudit(): Promise<void> {
	const repoRoot = join(import.meta.dir, '..');
	const derivedOnly = new Set(DERIVED_ONLY_SCHEMA_KEYS);
	const runtimeEnvVarNames = [
		...ENV_SCHEMA_FILE_PATHS.flatMap((path) =>
			extractSchemaKeyNames(readFileSync(join(repoRoot, path), 'utf8')).filter(
				(name) => !derivedOnly.has(name),
			),
		),
		...EXTRA_RUNTIME_ENV_VAR_NAMES,
	];
	const globalEnvVarNames = extractGlobalEnvVarNames(
		readFileSync(join(repoRoot, 'turbo.json'), 'utf8'),
	);
	const missing = findMissingGlobalEnvVars(runtimeEnvVarNames, globalEnvVarNames);

	if (missing.length === 0) {
		console.log(
			`[audit:turbo-env] ok: every runtime variable read by ${ENV_SCHEMA_FILE_PATHS.length} environment-schema.ts file(s) is declared in turbo.json's globalEnv.`,
		);
		return;
	}

	console.error('[audit:turbo-env] FAIL: variables env.ts reads but turbo.json globalEnv omits:');
	for (const name of missing) {
		console.error(`  - ${name}`);
	}
	process.exit(1);
}

if (import.meta.main) {
	await runAudit();
}
