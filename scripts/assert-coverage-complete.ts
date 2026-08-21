import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

/**
 * TEST-001: `bun run test:coverage`, the release-gate command the roadmap
 * names but which did not exist before this item.
 *
 * Bun's own `bun test --coverage` has two properties that make trusting its
 * "All files" summary line dangerous on this branch, whose whole history is
 * a record of suites that were green for the wrong reason:
 *
 *  1. It reports Funcs and Lines, but has no branch-coverage metric at all
 *     (confirmed empirically: `bun test --coverage` output never includes a
 *     branch column, in any workspace of this repository, on the installed
 *     Bun 1.3.x). The roadmap's acceptance criterion names "line, function,
 *     statement, and branch coverage" -- branch coverage cannot be measured
 *     by this toolchain as written, so this script can enforce line and
 *     function coverage but cannot enforce a metric Bun does not compute.
 *     That gap is reported explicitly by this script (and in TEST-001's own
 *     progress notes) rather than silently treated as satisfied.
 *  2. A source file that no test file ever imports does not appear in the
 *     report AT ALL -- it is not "0% covered," it is simply absent, which
 *     reads identically to "there was nothing to cover here." This is
 *     exactly this branch's recurring failure mode (a rate limiter at 0%
 *     effective coverage read as 100% healthy because the Redis-dependent
 *     test skipped). This script closes that hole by diffing the coverage
 *     report's file list against every `.ts`/`.tsx` file under each
 *     workspace's `src/`, and failing loudly on any file the coverage run
 *     never touched.
 *
 * This is a real gate, not a report: it exits nonzero (and prints exactly
 * which file and which metric) on the first workspace that fails either
 * check, so `bun run test:coverage` can be wired into CI and a pre-release
 * step the same way `assert-no-unexpected-skips.ts` already is for skips.
 */

interface WorkspaceTarget {
	readonly name: string;
	readonly directory: string;
}

const WORKSPACES: readonly WorkspaceTarget[] = [
	{ name: '@template/database', directory: 'packages/database' },
	{ name: '@template/mcp', directory: 'packages/mcp' },
	{ name: '@template/web', directory: 'applications/web' },
];

/** Every source file this coverage run is responsible for -- excludes test
 * files, type-only declaration files, and generated build output. */
function collectSourceFiles(workspaceDirectory: string): string[] {
	const sourceRoot = join(workspaceDirectory, 'src');
	const results: string[] = [];

	function walk(directory: string): void {
		for (const entry of readdirSync(directory)) {
			const fullPath = join(directory, entry);
			const entryStat = statSync(fullPath);
			if (entryStat.isDirectory()) {
				if (entry === 'node_modules' || entry === 'dist') continue;
				walk(fullPath);
				continue;
			}
			if (!/\.(ts|tsx)$/.test(entry)) continue;
			if (/\.test\.(ts|tsx)$/.test(entry)) continue;
			if (entry.endsWith('.d.ts')) continue;
			results.push(fullPath);
		}
	}

	walk(sourceRoot);
	return results;
}

interface LcovFileRecord {
	readonly sourceFile: string;
	readonly linesFound: number;
	readonly linesHit: number;
	readonly functionsFound: number;
	readonly functionsHit: number;
}

/** Minimal LCOV parser -- this repository's coverage runs never need
 * anything beyond `SF`/`LF`/`LH`/`FNF`/`FNH`/`end_of_record`. */
function parseLcov(lcovContents: string): LcovFileRecord[] {
	const records: LcovFileRecord[] = [];
	let currentFile: string | undefined;
	let linesFound = 0;
	let linesHit = 0;
	let functionsFound = 0;
	let functionsHit = 0;

	for (const rawLine of lcovContents.split('\n')) {
		const line = rawLine.trim();
		if (line.startsWith('SF:')) {
			currentFile = line.slice('SF:'.length);
		} else if (line.startsWith('LF:')) {
			linesFound = Number.parseInt(line.slice('LF:'.length), 10);
		} else if (line.startsWith('LH:')) {
			linesHit = Number.parseInt(line.slice('LH:'.length), 10);
		} else if (line.startsWith('FNF:')) {
			functionsFound = Number.parseInt(line.slice('FNF:'.length), 10);
		} else if (line.startsWith('FNH:')) {
			functionsHit = Number.parseInt(line.slice('FNH:'.length), 10);
		} else if (line === 'end_of_record') {
			if (currentFile) {
				records.push({
					sourceFile: currentFile,
					linesFound,
					linesHit,
					functionsFound,
					functionsHit,
				});
			}
			currentFile = undefined;
			linesFound = 0;
			linesHit = 0;
			functionsFound = 0;
			functionsHit = 0;
		}
	}

	return records;
}

async function runCoverageForWorkspace(workspace: WorkspaceTarget): Promise<boolean> {
	const coverageDirectory = mkdtempSync(join(tmpdir(), 'protokit-coverage-'));
	let workspaceFailed = false;

	try {
		// Reuse the workspace's own known-good `test` script (real env
		// variables, real isolation flags -- exactly what `bun turbo test`
		// already runs) rather than re-deriving a second, parallel command
		// line here that could silently drift from it.
		const packageJson = JSON.parse(
			readFileSync(join(workspace.directory, 'package.json'), 'utf8'),
		) as { scripts?: Record<string, string> };
		const testCommand = packageJson.scripts?.test;
		if (!testCommand) {
			console.error(`[test:coverage] ${workspace.name} has no "test" script; skipping`);
			return false;
		}

		const commandWithCoverage = `${testCommand} --coverage --coverage-reporter=lcov --coverage-dir=${coverageDirectory}`;

		const proc = Bun.spawn(['bash', '-c', commandWithCoverage], {
			cwd: workspace.directory,
			env: process.env,
			stdout: 'inherit',
			stderr: 'inherit',
		});
		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			console.error(`[test:coverage] ${workspace.name}: test run itself failed (exit ${exitCode})`);
			return false;
		}

		const lcovPath = join(coverageDirectory, 'lcov.info');
		let lcovContents: string;
		try {
			lcovContents = readFileSync(lcovPath, 'utf8');
		} catch {
			console.error(`[test:coverage] ${workspace.name}: no lcov.info produced at ${lcovPath}`);
			return false;
		}

		const records = parseLcov(lcovContents);
		// `--isolate` runs each test FILE in its own subprocess, and each
		// subprocess writes its own `SF:`/`end_of_record` block for every
		// module IT touched -- so a file exercised across several test files
		// appears as SEVERAL separate lcov records, not one merged record.
		// `record.sourceFile` is written relative to the SPAWNED PROCESS's
		// cwd (`workspace.directory`), not this script's own cwd, so it must
		// be used as-is (when relative) rather than passed through
		// `relative()` a second time -- doing so previously produced the
		// wrong key for every file and made this gate report already
		// well-tested files (`env.ts`, `oauth-routes.tsx`, `mcp-handler.ts`)
		// as never covered at all. Duplicate records for the same file are
		// merged by taking the best (maximum) hit count seen across every
		// subprocess that touched it -- the union of what all tests covered,
		// not whichever record happened to be read last.
		const coveredFiles = new Map<string, LcovFileRecord>();
		for (const record of records) {
			const key = record.sourceFile.startsWith('/')
				? relative(workspace.directory, record.sourceFile)
				: record.sourceFile;
			const existing = coveredFiles.get(key);
			if (!existing) {
				coveredFiles.set(key, { ...record, sourceFile: key });
				continue;
			}
			coveredFiles.set(key, {
				sourceFile: key,
				linesFound: Math.max(existing.linesFound, record.linesFound),
				linesHit: Math.max(existing.linesHit, record.linesHit),
				functionsFound: Math.max(existing.functionsFound, record.functionsFound),
				functionsHit: Math.max(existing.functionsHit, record.functionsHit),
			});
		}

		const sourceFiles = collectSourceFiles(workspace.directory).map((file) =>
			relative(workspace.directory, file),
		);

		for (const sourceFile of sourceFiles) {
			const record = coveredFiles.get(sourceFile);
			if (!record) {
				console.error(
					`[test:coverage] ${workspace.name}: ${sourceFile} is never imported by any test -- ` +
						`invisible to coverage, not "0% covered". Add a test that imports it.`,
				);
				workspaceFailed = true;
				continue;
			}
			if (record.linesFound > 0 && record.linesHit < record.linesFound) {
				console.error(
					`[test:coverage] ${workspace.name}: ${sourceFile} has ${record.linesFound - record.linesHit} uncovered line(s) (${record.linesHit}/${record.linesFound})`,
				);
				workspaceFailed = true;
			}
			if (record.functionsFound > 0 && record.functionsHit < record.functionsFound) {
				console.error(
					`[test:coverage] ${workspace.name}: ${sourceFile} has ${record.functionsFound - record.functionsHit} uncovered function(s) (${record.functionsHit}/${record.functionsFound})`,
				);
				workspaceFailed = true;
			}
		}
	} finally {
		rmSync(coverageDirectory, { recursive: true, force: true });
	}

	return !workspaceFailed;
}

async function main(): Promise<void> {
	let allPassed = true;

	for (const workspace of WORKSPACES) {
		console.log(`\n[test:coverage] === ${workspace.name} ===`);
		const passed = await runCoverageForWorkspace(workspace);
		if (!passed) allPassed = false;
	}

	console.log(
		'\n[test:coverage] NOTE: this gate enforces line and function coverage, and file-level ' +
			"completeness (every src file must appear in the report). Bun's coverage instrumentation " +
			'has no branch-coverage metric on the installed toolchain, so branch coverage cannot be ' +
			'mechanically enforced here -- see TEST-001 in PROGRESS.local.md for the measurability gap ' +
			'this leaves in the roadmap\'s "line, function, statement, and branch coverage" criterion.',
	);

	if (!allPassed) {
		console.error('\n[test:coverage] FAILED: one or more workspaces have incomplete coverage.');
		process.exit(1);
	}

	console.log('\n[test:coverage] All workspaces report complete line and function coverage.');
}

await main();
