import { describe, expect, it } from 'bun:test';

/**
 * CONFIG-001 / BUG-001: `env.ts` refuses `SKIP_ENV_VALIDATION` outright, at
 * module load, before `environmentalist.sync(...)` ever runs. The check runs
 * imperatively against the real `process.env`, so it can only be proven by
 * actually loading the module with that variable set -- not by
 * constructing a schema-only test around a mocked Environmentalist runtime.
 *
 * Proven via a real subprocess (`Bun.spawn`), matching the identical
 * pattern and rationale already established in
 * `packages/mcp/src/env.test.ts`'s `loadEnvironmentIn` -- NOT via a
 * same-process dynamic `import('./env.ts?query')`. Confirmed empirically
 * against this exact file: Bun 1.3.14's `--coverage` collector does not
 * union a source file's line-hit counters across multiple in-process
 * re-instantiations of that file; a fresh query-string reimport instead
 * resets/overwrites its counters, wiping out the coverage this
 * application's ~20+ other test files already recorded for the real
 * `environmentalist.sync(...)` path (confirmed by an earlier version of this file
 * regressing `src/env.ts` from 61/64 lines covered to 6/64 for the entire
 * suite run). A real subprocess cannot regress an already-covered line --
 * it is invisible to the parent process's coverage instrumentation -- but
 * for that same reason it also cannot close this specific gap: the guard
 * clause below (`if (process.env.SKIP_ENV_VALIDATION) { throw ... }`)
 * remains genuinely unclosable under this toolchain and is not silently
 * hidden -- see `packages/mcp/src/env.test.ts`'s identical, already-
 * documented note on its own sibling guard.
 */
describe('SKIP_ENV_VALIDATION guard', () => {
	it('throws immediately when SKIP_ENV_VALIDATION is set, before environmentalist.sync runs', async () => {
		const proc = Bun.spawn(['bun', '-e', "await import('./env.ts')"], {
			cwd: import.meta.dir,
			env: { ...process.env, SKIP_ENV_VALIDATION: 'true' },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain(
			'SKIP_ENV_VALIDATION is not supported. Supply a real environment instead — see .env.example.',
		);
	}, 15000);
});
