import { describe, expect, it } from 'bun:test';

/**
 * OBS-001: `LOG_CONTENT_DIAGNOSTICS_UNTIL` must be refused outright in
 * production, mirroring `SKIP_ENV_VALIDATION`'s fail-closed shape
 * (`CONFIG-001`). The check runs imperatively at module load, against the
 * real `process.env`, so it can only be proven by actually loading the
 * module in a fresh process with a real environment — not by constructing
 * a schema-only test around a mocked `t3-env` runtime.
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

/**
 * CONFIG-001 / BUG-001: the same fail-closed shape, checked before this
 * package's `SKIP_ENV_VALIDATION` guard has any escape hatch — see
 * `applications/web/src/env.ts` for the full rationale. Reuses
 * `loadEnvironmentIn` above rather than a same-process dynamic
 * `import('./env.ts?query')`: confirmed empirically that Bun 1.3.14's
 * `--coverage` collector resets a source file's line-hit counters on every
 * fresh in-process re-instantiation of that file, so re-importing `env.ts`
 * in-process to observe the throw would wipe out the coverage already
 * recorded for the successful `createEnv(...)` path instead of unioning
 * with it — regardless of import order or whether the two imports are
 * split across separate test files. A real subprocess cannot regress an
 * already-covered line (it is invisible to the parent's coverage
 * instrumentation), but for that same reason it also cannot close this
 * gap — lines 9-11 remain a genuinely unclosable gap under this
 * toolchain, not silently skipped.
 */
describe('SKIP_ENV_VALIDATION guard', () => {
	it('throws immediately when SKIP_ENV_VALIDATION is set, before createEnv runs', async () => {
		const { exitCode, stderr } = await loadEnvironmentIn({
			SKIP_ENV_VALIDATION: 'true',
			NODE_ENV: 'test',
		});
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain(
			'SKIP_ENV_VALIDATION is not supported. Supply a real environment instead — see .env.example.',
		);
	}, 15000);

	it('starts fine with valid environment and no SKIP_ENV_VALIDATION set', async () => {
		const { exitCode } = await loadEnvironmentIn({ NODE_ENV: 'test' });
		expect(exitCode).toBe(0);
	}, 15000);
});

describe('LOG_CONTENT_DIAGNOSTICS_UNTIL production guard', () => {
	it('refuses to start production with LOG_CONTENT_DIAGNOSTICS_UNTIL set', async () => {
		const { exitCode, stderr } = await loadEnvironmentIn({
			NODE_ENV: 'production',
			LOG_CONTENT_DIAGNOSTICS_UNTIL: '2099-01-01T00:00:00Z',
		});
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain('LOG_CONTENT_DIAGNOSTICS_UNTIL is not supported in production');
	}, 15000);

	it('allows LOG_CONTENT_DIAGNOSTICS_UNTIL in development', async () => {
		const { exitCode, stderr } = await loadEnvironmentIn({
			NODE_ENV: 'development',
			LOG_CONTENT_DIAGNOSTICS_UNTIL: '2099-01-01T00:00:00Z',
		});
		expect(exitCode).toBe(0);
		expect(stderr).not.toContain('LOG_CONTENT_DIAGNOSTICS_UNTIL is not supported in production');
	}, 15000);

	it('production starts fine with no LOG_CONTENT_DIAGNOSTICS_UNTIL set', async () => {
		const { exitCode } = await loadEnvironmentIn({ NODE_ENV: 'production' });
		expect(exitCode).toBe(0);
	}, 15000);
});
