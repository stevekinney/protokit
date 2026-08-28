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

/**
 * Every module specifier in a file: static `from '...'`, bare `import '...'`,
 * dynamic `import('...')`, and `require('...')`.
 *
 * Deliberately not limited to `.`-relative specifiers. The previous version
 * was, and it meant an alias hop broke the walk: `error-disclosure.test.ts`
 * dynamically imports `@web/application`, which imports the package, so the
 * check reported no offender while the command failed to resolve.
 */
const ANY_IMPORT = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

/**
 * TypeScript `paths` mappings, read from the workspaces' own tsconfigs rather
 * than hardcoded. `@web/*` is the one that matters today; reading the config
 * means a new alias does not need this file edited to keep the walk honest.
 */
function readPathAliases(): { prefix: string; directory: string }[] {
	const aliases: { prefix: string; directory: string }[] = [];

	for (const configPath of ['applications/web/tsconfig.json', 'tsconfig.json']) {
		if (!existsSync(configPath)) continue;
		const raw = readFileSync(configPath, 'utf-8');
		let config: { compilerOptions?: { paths?: Record<string, string[]> } };
		try {
			// Parsed as-is first. Stripping comments up front looks harmless and is
			// not: a `/\*...\*/` pattern matches inside a glob, because
			// `"src/**/*.ts"` contains `/*` and then `*/` two characters later. That
			// ate `/**/` out of a legitimate string, broke the parse, and left this
			// alias list silently empty — disabling alias resolution without ever
			// failing.
			config = JSON.parse(raw) as typeof config;
		} catch {
			try {
				// Only if the file genuinely is JSONC. Line comments and trailing
				// commas only: a block comment cannot be stripped safely by regex.
				config = JSON.parse(
					raw.replace(/(^|[^:"'\\])\/\/[^\n]*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1'),
				) as typeof config;
			} catch {
				continue;
			}
		}

		for (const [pattern, targets] of Object.entries(config.compilerOptions?.paths ?? {})) {
			const target = targets[0];
			if (target === undefined || !pattern.endsWith('/*') || !target.endsWith('/*')) continue;
			aliases.push({
				prefix: pattern.slice(0, -1),
				directory: resolve(dirname(configPath), target.slice(0, -1)),
			});
		}
	}

	return aliases;
}

const PATH_ALIASES = readPathAliases();

/** The package's own sources, which resolve siblings without the build. */
const PACKAGE_SOURCE_ROOT = resolve('packages/mcp');

/**
 * Candidate on-disk files for one import specifier, or `[]` when the specifier
 * names something outside this repository.
 */
function candidatesFor(fromFile: string, specifier: string): string[] {
	let base: string;
	if (specifier.startsWith('.')) {
		base = resolve(dirname(fromFile), specifier);
	} else {
		const alias = PATH_ALIASES.find((entry) => specifier.startsWith(entry.prefix));
		if (alias === undefined) return [];
		base = resolve(alias.directory, specifier.slice(alias.prefix.length));
	}

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

/** Whether the package is reachable from a file, following imports. */
const reachesPackage = (() => {
	const memo = new Map<string, boolean>();

	return function walk(file: string, seen = new Set<string>()): boolean {
		const cached = memo.get(file);
		if (cached !== undefined) return cached;
		if (seen.has(file) || !existsSync(file)) return false;
		seen.add(file);

		// The package's own sources never consume its `exports` map — they import
		// each other relatively and run from source, so they need no `dist/`.
		// Without this, running a test that lives inside `packages/mcp` looked
		// like it required the build. Verified: `test:metadata` runs cleanly with
		// `dist/` absent.
		if (file.startsWith(PACKAGE_SOURCE_ROOT)) {
			memo.set(file, false);
			return false;
		}

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

		for (const match of contents.matchAll(ANY_IMPORT)) {
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

	test('the walk follows workspace path aliases, not just relative specifiers', () => {
		// `error-disclosure.test.ts` reaches the package only through
		// `@web/application`. A relative-only walk reported no offender while
		// the command failed to resolve.
		expect(PATH_ALIASES.length).toBeGreaterThan(0);
		expect(PATH_ALIASES.some((alias) => alias.prefix === '@web/')).toBe(true);
		expect(reachesPackage(resolve('applications/web/src/error-disclosure.test.ts'))).toBe(true);
	});

	test('`build:engine` exists and actually builds the package', () => {
		const command = manifest.scripts[BUILD_PREREQUISITE];
		expect(command).toBeDefined();
		expect(command).toContain('turbo build');
		expect(command).toContain(PACKAGE_SPECIFIER);
	});
});
