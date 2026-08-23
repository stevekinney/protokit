import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import {
	ENV_FILE_PATHS,
	extractGlobalEnvVarNames,
	extractRuntimeEnvVarNames,
	findMissingGlobalEnvVars,
} from './audit-turbo-env.js';

describe('extractRuntimeEnvVarNames', () => {
	it('extracts both the dot form and the bracket-literal form', () => {
		const names = extractRuntimeEnvVarNames(
			`runtimeEnv: {
				FOO: process.env.FOO,
				NODE_ENV: process.env['NODE_ENV'],
			}`,
		);
		expect(names).toEqual(['FOO', 'NODE_ENV']);
	});

	it('de-duplicates a variable read more than once', () => {
		const names = extractRuntimeEnvVarNames(
			`RAILWAY_REPLICA_IDENTIFIER: process.env.RAILWAY_REPLICA_ID ?? process.env.RAILWAY_INSTANCE_ID,`,
		);
		expect(names).toEqual(['RAILWAY_INSTANCE_ID', 'RAILWAY_REPLICA_ID']);
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
describe('turbo.json globalEnv coverage (regression, real files)', () => {
	it('declares every variable read by every env.ts runtimeEnv block', () => {
		const repoRoot = join(import.meta.dir, '..');
		const runtimeEnvVarNames = ENV_FILE_PATHS.flatMap((path) =>
			extractRuntimeEnvVarNames(readFileSync(join(repoRoot, path), 'utf8')),
		);
		const globalEnvVarNames = extractGlobalEnvVarNames(
			readFileSync(join(repoRoot, 'turbo.json'), 'utf8'),
		);
		expect(findMissingGlobalEnvVars(runtimeEnvVarNames, globalEnvVarNames)).toEqual([]);
	});
});
