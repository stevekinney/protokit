import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * `packages/mcp`'s `exports` resolve into its `dist/`, so any code importing it
 * needs that package built first. Turborepo handles this for workspace tasks
 * through `dependsOn: ["^build"]`, but a root script that runs a source file
 * directly — `bun scripts/doctor.ts`, `bun test applications/web/src/...` —
 * bypasses the graph and gets no such help.
 *
 * The invariant is checked against the real import graph rather than a name
 * list, because both cheaper approximations are wrong:
 *
 * - Scanning only files that import the package *directly* misses the common
 *   case. `mcp-routes.test.ts` imports `mcp-routes.ts`, which imports the
 *   package; the test file itself mentions it nowhere. An earlier version of
 *   this very check made that mistake and passed while `test:security` was
 *   broken.
 * - Requiring the prerequisite on every script that touches workspace source
 *   would cover 53 scripts, most of which never reach the package, and would
 *   turn a real invariant into noise people route around.
 *
 * So: follow each invoked file's relative imports transitively, and require
 * the prerequisite exactly where the package is reachable.
 */

const PACKAGE_SPECIFIER = '@lostgradient/mcp';
const BUILD_PREREQUISITE = 'build:engine';
const INVOKED_PATH =
	/(?:applications|packages|scripts|runner)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|mts|cts|js|mjs|svelte)/g;
const RELATIVE_IMPORT = /(?:from|import|require)\s*\(?\s*['"](\.[^'"]+)['"]/g;

/** Candidate on-disk files for one import specifier. */
function candidatesFor(fromFile: string, specifier: string): string[] {
	const base = resolve(dirname(fromFile), specifier);
	const withoutExtension = base.replace(/\.(js|mjs|cjs)$/, '');
	return [
		base,
		`${withoutExtension}.ts`,
		`${withoutExtension}.tsx`,
		`${withoutExtension}.mts`,
		`${withoutExtension}.svelte`,
		join(base, 'index.ts'),
		join(base, 'index.tsx'),
	];
}

const reachesPackage = (() => {
	const memo = new Map<string, boolean>();

	return function walk(file: string, seen = new Set<string>()): boolean {
		const cached = memo.get(file);
		if (cached !== undefined) return cached;
		if (seen.has(file) || !existsSync(file)) return false;
		seen.add(file);

		let contents: string;
		try {
			contents = readFileSync(file, 'utf-8');
		} catch {
			return false;
		}

		if (contents.includes(PACKAGE_SPECIFIER)) {
			memo.set(file, true);
			return true;
		}

		for (const match of contents.matchAll(RELATIVE_IMPORT)) {
			const specifier = match[1];
			if (specifier === undefined) continue;
			for (const candidate of candidatesFor(file, specifier)) {
				if (existsSync(candidate) && walk(candidate, seen)) {
					memo.set(file, true);
					return true;
				}
			}
		}

		memo.set(file, false);
		return false;
	};
})();

/**
 * Scripts that reach the package but resolve it another way. Each names how,
 * so an exemption cannot quietly become a hiding place.
 */
const EXEMPT: Record<string, string> = {
	'test:container-smoke': 'builds the engine internally before its own direct web build',
	'test:coverage': 'builds @template/web, whose Turborepo graph builds the engine',
};

describe('root scripts that reach the MCP engine', () => {
	const manifest = JSON.parse(readFileSync('package.json', 'utf-8')) as {
		scripts: Record<string, string>;
	};

	/** Scripts that run workspace source outside Turborepo's dependency graph. */
	const directRunners = Object.entries(manifest.scripts)
		.filter(([, command]) => !/\bturbo (run )?build/.test(command.split('&&')[0] ?? ''))
		.map(([name, command]) => ({ name, command, paths: command.match(INVOKED_PATH) ?? [] }))
		.filter((entry) => entry.paths.length > 0);

	test('the analysis finds something, so this suite cannot pass vacuously', () => {
		expect(directRunners.length).toBeGreaterThan(0);
		const anyReaches = directRunners.some((entry) =>
			entry.paths.some((path) => reachesPackage(resolve(path))),
		);
		expect(anyReaches).toBe(true);
	});

	test('every script that can reach the engine builds it first, or is exempt', () => {
		const offenders: string[] = [];

		for (const { name, command, paths } of directRunners) {
			if (name in EXEMPT) continue;
			if (command.includes(BUILD_PREREQUISITE)) continue;
			if (!paths.some((path) => reachesPackage(resolve(path)))) continue;
			offenders.push(name);
		}

		expect(
			offenders,
			`These root scripts run code that transitively imports ${PACKAGE_SPECIFIER} without ` +
				`building it first. Prefix each with \`bun run ${BUILD_PREREQUISITE} && \`, or add an ` +
				`EXEMPT entry naming how it resolves the package another way.`,
		).toEqual([]);
	});

	test('every exemption still names a script that exists', () => {
		for (const name of Object.keys(EXEMPT)) {
			expect(manifest.scripts[name], `EXEMPT names "${name}", which is not a script`).toBeDefined();
		}
	});

	test('the import walk follows transitive edges, not just direct mentions', () => {
		// The case the previous version of this check missed: a file that reaches
		// the package only through another file.
		const transitive = 'applications/web/src/routes/mcp-routes.test.ts';
		expect(existsSync(transitive)).toBe(true);
		expect(readFileSync(transitive, 'utf-8').includes(PACKAGE_SPECIFIER)).toBe(true);
		// And one that genuinely does not reach it, so the walk is not answering
		// "true" for everything.
		expect(reachesPackage(resolve('scripts/audit-docker-context.ts'))).toBe(false);
	});

	test('`build:engine` exists and actually builds the package', () => {
		const command = manifest.scripts[BUILD_PREREQUISITE];
		expect(command).toBeDefined();
		expect(command).toContain('turbo build');
		expect(command).toContain(PACKAGE_SPECIFIER);
	});
});
