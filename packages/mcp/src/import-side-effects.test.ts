import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
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

/**
 * The `exports` map is the single source of truth for which subpaths exist, so
 * a newly added export is covered automatically. Its values are condition
 * objects pointing into `dist/` (the published shape), and this suite runs
 * against source — so each published path is translated back to the source
 * file that produces it.
 *
 * The built artifact is checked too, when it exists. A source file with no
 * import-time environment read can still become a bundle that has one, and the
 * bundle is what a consumer actually loads. `dist/` is gitignored and absent
 * before a build, so its absence skips that half rather than failing: the
 * clean-directory install in TRI-74 covers the built artifact under Node
 * directly.
 */
type EntryPoint = { subpath: string; label: string; absolutePath: string };

const exportConditions = packageMetadata.exports as Record<
	string,
	{ import?: string; default?: string } | string
>;

const entryPointSubpaths: EntryPoint[] = [];

for (const [subpath, condition] of Object.entries(exportConditions)) {
	// `./package.json` is data, not a module with side effects.
	if (subpath.endsWith('.json')) continue;

	const published =
		typeof condition === 'string' ? condition : (condition.import ?? condition.default);
	if (published === undefined) continue;

	const sourcePath = resolve(
		packageRoot,
		published.replace(/^\.\/dist\//, './src/').replace(/\.js$/, '.ts'),
	);
	if (existsSync(sourcePath)) {
		entryPointSubpaths.push({ subpath, label: `${subpath} (source)`, absolutePath: sourcePath });
	}

	const builtPath = resolve(packageRoot, published);
	if (existsSync(builtPath)) {
		entryPointSubpaths.push({ subpath, label: `${subpath} (built)`, absolutePath: builtPath });
	}
}

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

	for (const { label, absolutePath } of entryPointSubpaths) {
		it(`imports "${label}" cleanly under a deliberately invalid environment`, async () => {
			const { exitCode, stderr } = await importInPoisonedSubprocess(absolutePath);
			expect({ label, exitCode, stderr }).toMatchObject({ exitCode: 0 });
		}, 30_000);
	}
});
