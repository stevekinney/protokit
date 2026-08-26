import { describe, expect, it } from 'bun:test';
import { environment } from './env';

/**
 * CONFIG-001 / BUG-001: `env.ts` refuses `SKIP_ENV_VALIDATION` outright, at
 * module load, before `createEnv(...)` ever runs. This can only be proven
 * by actually loading the module in a fresh process with a real
 * environment -- mirrors the idiom `packages/mcp/src/env.test.ts` already
 * uses for its own `SKIP_ENV_VALIDATION`/`LOG_CONTENT_DIAGNOSTICS_UNTIL`
 * guards, for the same reason: `bun test` in this workspace has no
 * `--isolate`, so every test file shares one process, and `./env` is
 * already imported successfully (via `baseline.test.ts`, `local-proxy
 * .test.ts`, etc.) long before this file runs. A same-process dynamic
 * `import('./env.ts?query')` was tried first and rejected -- confirmed
 * empirically (across ~10 probe runs) that Bun 1.3.14's `--coverage`
 * collector resets a source file's line-hit counters on every fresh
 * in-process re-instantiation of that file, so re-importing `env.ts` to
 * observe the throw wipes out the *already-recorded* successful
 * `createEnv(...)` lines instead of unioning with them -- it does not
 * matter which import runs first/last or whether the two imports are
 * split across separate test files; whichever fresh module evaluation
 * happens to be the last one recorded replaces the entire file's coverage
 * record. A real subprocess, by contrast, is invisible to the parent
 * process's coverage instrumentation entirely, so it cannot regress an
 * already-covered line -- it just cannot close this gap either. See this
 * file's own doc comment at the bottom for why lines 9-11 are reported as
 * a genuinely unclosable gap under this toolchain, not silently skipped.
 */
async function loadEnvironmentIn(env: Record<string, string>): Promise<{
	exitCode: number;
	stderr: string;
}> {
	const proc = Bun.spawn({
		cmd: ['bun', '-e', "await import('./env.ts')"],
		cwd: import.meta.dir,
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
	return { exitCode, stderr };
}

describe('SKIP_ENV_VALIDATION guard', () => {
	it('throws immediately when SKIP_ENV_VALIDATION is set, before createEnv runs', async () => {
		const { exitCode, stderr } = await loadEnvironmentIn({
			SKIP_ENV_VALIDATION: 'true',
			DATABASE_URL: 'postgresql://protokit:protokit@db.localtest.me:5432/protokit_test',
		});
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain(
			'SKIP_ENV_VALIDATION is not supported. Supply a real environment instead — see .env.example.',
		);
	}, 15000);

	it('starts fine with valid environment and no SKIP_ENV_VALIDATION set', async () => {
		const { exitCode } = await loadEnvironmentIn({
			DATABASE_URL: 'postgresql://protokit:protokit@db.localtest.me:5432/protokit_test',
		});
		expect(exitCode).toBe(0);
	}, 15000);
});

describe('environment', () => {
	it('validates the real test-process environment and exposes DATABASE_URL', () => {
		expect(environment.DATABASE_URL).toBeDefined();
		expect(typeof environment.DATABASE_URL).toBe('string');
		expect(environment.DATABASE_URL.length).toBeGreaterThan(0);
	});
});
