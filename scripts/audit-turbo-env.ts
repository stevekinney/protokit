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
 * for that class of drift recurring: every `env.ts` in the repository is
 * the single source of truth for what a package actually reads, so this
 * derives the expected set from those files rather than restating them,
 * the same "derive, don't restate" rule `DX-001`'s `doctor` follows for
 * `src/env.ts` schemas.
 */

/** Repo-relative paths of every `env.ts` this audit checks, one per package that reads `process.env` directly. */
export const ENV_FILE_PATHS: readonly string[] = [
	'applications/web/src/env.ts',
	'packages/mcp/src/env.ts',
	'packages/database/src/env.ts',
];

/**
 * Extracts every environment variable name an `env.ts` file's `runtimeEnv`
 * block actually reads from `process.env`, in either the dot form
 * (`process.env.FOO`) or the bracket-literal form required for `NODE_ENV`
 * (`process.env['NODE_ENV']`). Deliberately regex-based rather than a real
 * parse: `env.ts` files in this repository are hand-written and small, and
 * a regex over the literal `process.env.KEY` / `process.env['KEY']` shape
 * is exactly what every existing entry looks like.
 */
export function extractRuntimeEnvVarNames(source: string): string[] {
	const names = new Set<string>();
	const dotForm = /process\.env\.([A-Z][A-Z0-9_]*)/g;
	const bracketForm = /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g;
	for (const match of source.matchAll(dotForm)) {
		names.add(match[1]!);
	}
	for (const match of source.matchAll(bracketForm)) {
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
	const runtimeEnvVarNames = ENV_FILE_PATHS.flatMap((path) =>
		extractRuntimeEnvVarNames(readFileSync(join(repoRoot, path), 'utf8')),
	);
	const globalEnvVarNames = extractGlobalEnvVarNames(
		readFileSync(join(repoRoot, 'turbo.json'), 'utf8'),
	);
	const missing = findMissingGlobalEnvVars(runtimeEnvVarNames, globalEnvVarNames);

	if (missing.length === 0) {
		console.log(
			`[audit:turbo-env] ok: every runtime variable read by ${ENV_FILE_PATHS.length} env.ts file(s) is declared in turbo.json's globalEnv.`,
		);
		return;
	}

	console.error(
		'[audit:turbo-env] FAIL: variables read by env.ts but missing from turbo.json globalEnv:',
	);
	for (const name of missing) {
		console.error(`  - ${name}`);
	}
	process.exit(1);
}

if (import.meta.main) {
	await runAudit();
}
