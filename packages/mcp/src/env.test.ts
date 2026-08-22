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
