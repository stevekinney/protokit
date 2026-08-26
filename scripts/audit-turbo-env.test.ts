import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import {
	DERIVED_ONLY_SCHEMA_KEYS,
	ENV_SCHEMA_FILE_PATHS,
	EXTRA_RUNTIME_ENV_VAR_NAMES,
	extractGlobalEnvVarNames,
	extractSchemaKeyNames,
	findMissingGlobalEnvVars,
} from './audit-turbo-env.js';

describe('extractSchemaKeyNames', () => {
	it('extracts every top-level key of a schema shape object', () => {
		const names = extractSchemaKeyNames(
			`export const fooServerEnvironmentSchema = {
	FOO: z.string(),
	NODE_ENV: z.enum(['development', 'production', 'test']),
};`,
		);
		expect(names).toEqual(['FOO', 'NODE_ENV']);
	});

	it('ignores nested/indented lines that are not top-level keys', () => {
		const names = extractSchemaKeyNames(
			`export const fooServerEnvironmentSchema = {
	FOO: z
		.enum(['fatal', 'error'])
		.optional()
		.default('info'),
};`,
		);
		expect(names).toEqual(['FOO']);
	});
});

describe('findMissingGlobalEnvVars', () => {
	it('flags a runtime variable absent from globalEnv', () => {
		const missing = findMissingGlobalEnvVars(['FOO', 'BAR'], ['FOO']);
		expect(missing).toEqual(['BAR']);
	});

	it('reports nothing when every runtime variable is declared', () => {
		const missing = findMissingGlobalEnvVars(['FOO', 'BAR'], ['FOO', 'BAR', 'BAZ']);
		expect(missing).toEqual([]);
	});

	it('never flags SKIP_ENV_VALIDATION -- it is checked only to reject it, not a real configuration value', () => {
		const missing = findMissingGlobalEnvVars(['SKIP_ENV_VALIDATION'], []);
		expect(missing).toEqual([]);
	});
});

// Regression coverage for the review finding itself (`turbo.json:50`):
// several variables `env.ts` already read -- MCP_REFRESH_TOKEN_TTL_SECONDS,
// RATE_LIMIT_METRICS_MAX, HEALTH_READINESS_API_KEY,
// SCHEDULED_CLEANUP_INTERVAL_SECONDS among them -- were missing from
// turbo.json's globalEnv, so a cached `test` result could be served across a
// change to one of those variables. This runs the audit against the real
// repository files, not a fixture, so it fails exactly the way `bun run
// audit:turbo-env` would if the gap ever reopens.
//
// Also regression coverage for a second, later gap: the
// `@lostgradient/environmentalist` migration replaced every `env.ts`'s
// literal `process.env.KEY` reads with a dynamic enumeration, which
// silently turned the previous regex-over-`env.ts` extraction into a
// no-op that always reported success. Deriving from `environment-schema.ts`
// instead keeps this audit load-bearing regardless of how `env.ts` reads
// `process.env`.
describe('turbo.json globalEnv coverage (regression, real files)', () => {
	it('declares every variable read by every environment-schema.ts shape, plus the extra OS-sourced variables', () => {
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
		expect(findMissingGlobalEnvVars(runtimeEnvVarNames, globalEnvVarNames)).toEqual([]);
	});
});
