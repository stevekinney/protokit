import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import packageMetadata from '../package.json';

/**
 * Criterion 1: importing any entry point of this package must not read
 * `process.env` and must not throw, whatever the ambient environment.
 *
 * This runs in a subprocess rather than with an in-process `await
 * import()`. Two reasons, both of which make the in-process form unable to
 * prove the property:
 *
 * - Bun's module cache is shared across a test file. Any earlier import of
 *   the module under test — including one pulled in transitively by
 *   another test — means the module body has already been evaluated, so a
 *   re-import observes nothing and passes regardless.
 * - `process.env` cannot be truly emptied in-process; the package's own
 *   `test` script injects `NODE_ENV` and `LOG_LEVEL`, so an in-process
 *   check would run against an environment that is already valid.
 *
 * The subprocess gets a deliberately hostile environment: `NODE_ENV`
 * absent (the schema requires it, with no default), `MCP_CONFORMANCE_MODE`
 * set to an invalid enum value, and `SKIP_ENV_VALIDATION` set (which
 * `parseMcpServerEnvironment` refuses outright). Any import-time
 * validation reintroduced into this package fails against all three.
 */

const packageRoot = resolve(import.meta.dir, '..');

const entryPointSubpaths = Object.entries(packageMetadata.exports as Record<string, string>).map(
	([subpath, relativePath]) => ({
		subpath,
		absolutePath: resolve(packageRoot, relativePath),
	}),
);

const poisonedEnvironment: Record<string, string> = {
	PATH: process.env.PATH ?? '/usr/bin:/bin',
	MCP_CONFORMANCE_MODE: 'yes',
	SKIP_ENV_VALIDATION: '1',
	LOG_CONTENT_DIAGNOSTICS_UNTIL: 'not-a-timestamp',
};

async function importInPoisonedSubprocess(
	absolutePath: string,
): Promise<{ exitCode: number; stderr: string }> {
	const child = Bun.spawn({
		cmd: [process.execPath, '-e', `await import(${JSON.stringify(absolutePath)});`],
		env: poisonedEnvironment,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	return { exitCode, stderr };
}

describe('import-time side effects', () => {
	it('covers every subpath in the package exports map', () => {
		// Guards the sweep itself: the list is derived from `package.json`,
		// so a newly added export is covered automatically, but an exports
		// map that somehow became empty would otherwise vacuously pass.
		expect(entryPointSubpaths.length).toBeGreaterThanOrEqual(6);
		expect(entryPointSubpaths.map((entry) => entry.subpath)).toContain('.');
	});

	for (const { subpath, absolutePath } of entryPointSubpaths) {
		it(`imports "${subpath}" cleanly under a deliberately invalid environment`, async () => {
			const { exitCode, stderr } = await importInPoisonedSubprocess(absolutePath);
			expect({ subpath, exitCode, stderr }).toMatchObject({ exitCode: 0 });
		}, 30_000);
	}
});
