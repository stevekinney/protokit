import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `packages/mcp`'s `exports` resolve into its `dist/`, so any script importing
 * it needs that package built first. Turborepo handles this for workspace
 * tasks through `dependsOn: ["^build"]`, but root scripts invoked as
 * `bun scripts/whatever.ts` bypass the graph entirely and get no such help.
 *
 * This invariant exists because forgetting it is demonstrably easy: the gap
 * was found three separate times on one pull request — first by CI in the
 * container smoke test, then by review in `doctor` and `db:seed`, then by
 * review again in `audit:production-content`, with `test:doctor` and
 * `test:scripts-security` broken the whole time and reported by nobody. Each
 * fix addressed the instance in front of it. This addresses the class.
 */

const PACKAGE_SPECIFIER = '@lostgradient/mcp';
const BUILD_PREREQUISITE = 'build:engine';

/**
 * Scripts that resolve the package some other way and do not need the prefix.
 * Each entry names why, so an exemption cannot quietly become a hiding place.
 */
const EXEMPT: Record<string, string> = {
	// Builds the engine itself, inside the script, before its direct web build.
	'test:container-smoke': 'builds the engine internally before its own build step',
	// Builds `@template/web`, which reaches the engine through `^build`.
	'test:coverage': 'builds @template/web, whose Turborepo graph builds the engine',
};

/** Root scripts, and the `scripts/*.ts` files each one runs. */
function scriptsInvokedBy(command: string, available: readonly string[]): string[] {
	return available.filter((file) => command.includes(`scripts/${file}`));
}

describe('root scripts that import the MCP engine', () => {
	const manifest = JSON.parse(readFileSync('package.json', 'utf-8')) as {
		scripts: Record<string, string>;
	};

	const scriptFiles = readdirSync('scripts').filter((name) => name.endsWith('.ts'));
	const importers = scriptFiles.filter((name) =>
		readFileSync(join('scripts', name), 'utf-8').includes(PACKAGE_SPECIFIER),
	);

	test('the detection itself finds something, so this suite cannot pass vacuously', () => {
		expect(importers.length).toBeGreaterThan(0);
		expect(Object.keys(manifest.scripts).length).toBeGreaterThan(0);
	});

	test('every one of them builds the engine first, or is exempt with a stated reason', () => {
		const offenders: string[] = [];

		for (const [name, command] of Object.entries(manifest.scripts)) {
			if (scriptsInvokedBy(command, importers).length === 0) continue;
			if (name in EXEMPT) continue;
			if (command.includes(BUILD_PREREQUISITE)) continue;
			offenders.push(name);
		}

		expect(
			offenders,
			`These root scripts run a file importing ${PACKAGE_SPECIFIER} without building it first. ` +
				`Prefix the command with \`bun run ${BUILD_PREREQUISITE} && \`, or add an entry to EXEMPT ` +
				`with the reason it resolves the package another way.`,
		).toEqual([]);
	});

	test('every exemption still names a script that exists', () => {
		// An exemption for a deleted script hides nothing and is dead weight —
		// and worse, could later shadow a real script of the same name.
		for (const name of Object.keys(EXEMPT)) {
			expect(manifest.scripts[name], `EXEMPT names "${name}", which is not a script`).toBeDefined();
		}
	});

	test('`build:engine` exists and actually builds the package', () => {
		const command = manifest.scripts[BUILD_PREREQUISITE];
		expect(command).toBeDefined();
		expect(command).toContain('turbo build');
		expect(command).toContain(PACKAGE_SPECIFIER);
	});
});
