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
			// `.svelte` is included deliberately: Bun's coverage instrumentation
			// does emit `SF:` records for compiled components, so leaving them out
			// let a page render with no test at all still report the workspace as
			// complete. `.tsx` is gone from this repository entirely.
			if (!/\.(ts|svelte)$/.test(entry)) continue;
			if (/\.test\.ts$/.test(entry)) continue;
			if (entry.endsWith('.d.ts')) continue;
			results.push(fullPath);
		}
	}

	walk(sourceRoot);
	return results;
}

export interface LcovFileRecord {
	readonly sourceFile: string;
	/**
	 * Review finding (P2): the previous version of this record carried only
	 * the `LF`/`LH` SUMMARY counts (lines found / lines hit), not which
	 * SPECIFIC lines were hit. `--isolate` runs each test file in its own
	 * subprocess, so a source file exercised by several test files produces
	 * several separate lcov records for it -- and merging by taking the
	 * MAXIMUM `LH` across records is not their union: two records that each
	 * cover a different 5-of-10 lines both report `LH=5`, and
	 * `max(5, 5) = 5` incorrectly reports 5/10 for a file whose combined
	 * coverage across both test files is genuinely 10/10. Parsing each
	 * `DA:<line>,<count>` entry (rather than only the `LF`/`LH` summary)
	 * gives this script the actual per-line identity it needs to compute a
	 * REAL union across records: a line counts as hit if hit in ANY record
	 * that covers this file, not merely in whichever record happened to
	 * report the highest count.
	 */
	readonly lineHits: ReadonlyMap<number, number>;
	readonly functionsFound: number;
	readonly functionsHit: number;
}

/**
 * Minimal LCOV parser -- this repository's coverage runs never need
 * anything beyond `SF`/`DA`/`FNF`/`FNH`/`end_of_record`.
 *
 * Review finding (P2), function coverage: Bun 1.3.14's `--coverage-reporter=lcov`
 * output never emits `FN:`/`FNDA:` records (confirmed empirically against
 * this toolchain's actual output) -- only the `FNF`/`FNH` AGGREGATE counts
 * per file, with no per-function name or line to give a real union
 * something to merge by identity. `LF`/`LH` are intentionally not parsed
 * here either, even though Bun does emit them: they are exactly the
 * pre-computed summary this fix works around for lines, and are recomputed
 * from the unioned `DA:` map below instead, once records for the same file
 * are merged. Function coverage below therefore still uses the
 * maximum-across-records approximation this fix replaces for lines --
 * documented as a real, unclosed gap in `runCoverageForWorkspace`'s merge
 * step and in this script's own end-of-run NOTE, not silently masked, the
 * same way this file already discloses that Bun has no branch-coverage
 * metric at all.
 */
export function parseLcov(lcovContents: string): LcovFileRecord[] {
	const records: LcovFileRecord[] = [];
	let currentFile: string | undefined;
	let lineHits = new Map<number, number>();
	let functionsFound = 0;
	let functionsHit = 0;

	for (const rawLine of lcovContents.split('\n')) {
		const line = rawLine.trim();
		if (line.startsWith('SF:')) {
			currentFile = line.slice('SF:'.length);
		} else if (line.startsWith('DA:')) {
			const [lineNumberText, hitCountText] = line.slice('DA:'.length).split(',');
			const lineNumber = Number.parseInt(lineNumberText ?? '', 10);
			const hitCount = Number.parseInt(hitCountText ?? '', 10);
			if (Number.isFinite(lineNumber) && Number.isFinite(hitCount)) {
				lineHits.set(lineNumber, hitCount);
			}
		} else if (line.startsWith('FNF:')) {
			functionsFound = Number.parseInt(line.slice('FNF:'.length), 10);
		} else if (line.startsWith('FNH:')) {
			functionsHit = Number.parseInt(line.slice('FNH:'.length), 10);
		} else if (line === 'end_of_record') {
			if (currentFile) {
				records.push({
					sourceFile: currentFile,
					lineHits,
					functionsFound,
					functionsHit,
				});
			}
			currentFile = undefined;
			lineHits = new Map();
			functionsFound = 0;
			functionsHit = 0;
		}
	}

	return records;
}

export interface MergedFileCoverage {
	readonly linesFound: number;
	readonly linesHit: number;
	readonly functionsFound: number;
	readonly functionsHit: number;
}

/**
 * `--isolate` runs each test FILE in its own subprocess, and each
 * subprocess writes its own `SF:`/`end_of_record` block for every module IT
 * touched -- so a file exercised across several test files appears as
 * SEVERAL separate lcov records, not one merged record. `record.sourceFile`
 * is written relative to the SPAWNED PROCESS's cwd (`workspaceDirectory`),
 * not this script's own cwd, so it must be used as-is (when relative)
 * rather than passed through `relative()` a second time -- doing so
 * previously produced the wrong key for every file and made this gate
 * report already well-tested files (`env.ts`, `oauth-routes.ts`,
 * `mcp-handler.ts`) as never covered at all.
 *
 * Review finding (P2): duplicate records for the same file used to be
 * merged by taking the MAXIMUM `linesHit`/`linesFound` seen across records
 * -- not their union. Two records that each cover a different 5-of-10
 * lines both report 5 hit, and `max(5, 5) = 5` incorrectly reports 5/10 for
 * a file whose combined coverage is genuinely 10/10 -- under-reporting real
 * coverage and potentially masking which lines are ACTUALLY uncovered (a
 * false failure hides the true, different gap). Lines are now unioned by
 * their real per-line identity (`DA:<line>,<count>` from `parseLcov`): a
 * line counts as hit the moment ANY record covering this file hit it.
 *
 * Functions have no such identity available in Bun's lcov output (see
 * `parseLcov`'s doc comment -- no `FN:`/`FNDA:` records are ever emitted,
 * only an `FNF`/`FNH` aggregate count per record) and still use the
 * maximum approximation this fix replaces for lines -- a real, disclosed
 * gap (see this script's end-of-run NOTE), not silently masked. Exported
 * and pure specifically so this merge logic -- the actual defect this
 * review finding is about -- can be tested directly against synthetic
 * multi-record input, rather than only indirectly through a real
 * `bun test --coverage` subprocess run.
 */
export function mergeLcovRecordsByFile(
	records: readonly LcovFileRecord[],
	workspaceDirectory: string,
): Map<string, MergedFileCoverage> {
	const merged = new Map<
		string,
		{ lineHits: Map<number, number>; functionsFound: number; functionsHit: number }
	>();
	for (const record of records) {
		const key = record.sourceFile.startsWith('/')
			? relative(workspaceDirectory, record.sourceFile)
			: record.sourceFile;
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, {
				lineHits: new Map(record.lineHits),
				functionsFound: record.functionsFound,
				functionsHit: record.functionsHit,
			});
			continue;
		}
		for (const [lineNumber, hitCount] of record.lineHits) {
			existing.lineHits.set(lineNumber, Math.max(existing.lineHits.get(lineNumber) ?? 0, hitCount));
		}
		existing.functionsFound = Math.max(existing.functionsFound, record.functionsFound);
		existing.functionsHit = Math.max(existing.functionsHit, record.functionsHit);
	}

	const result = new Map<string, MergedFileCoverage>();
	for (const [key, value] of merged) {
		const linesFound = value.lineHits.size;
		const linesHit = [...value.lineHits.values()].filter((hitCount) => hitCount > 0).length;
		result.set(key, {
			linesFound,
			linesHit,
			functionsFound: value.functionsFound,
			functionsHit: value.functionsHit,
		});
	}
	return result;
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
		const coveredFiles = mergeLcovRecordsByFile(records, workspace.directory);

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
			// Svelte components get the file-completeness check above but not the
			// line and function thresholds below.
			//
			// Bun instruments the *compiled* component, and the same `.svelte`
			// source compiled in two `--isolate` processes with different import
			// graphs produces different instrumented output — so its `DA:` line
			// numbers are not comparable across records and unioning them is
			// meaningless. Measured directly: `privacy-policy-page.svelte` reports
			// LF:14/LH:14 (fully covered) when its own test file runs alone, and
			// 4/43 in the combined run, purely from merging incompatible records.
			//
			// Enforcing those numbers would therefore fail a fully covered
			// component. The completeness check is what actually catches the risk
			// worth catching here: a page that no test imports at all.
			if (sourceFile.endsWith('.svelte')) continue;

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
			'this leaves in the roadmap\'s "line, function, statement, and branch coverage" criterion. ' +
			'Line coverage across `--isolate` subprocess records is a real union (per-line identity, ' +
			"via each record's `DA:` entries). Function coverage is NOT a real union -- Bun's lcov " +
			'output never emits per-function `FN:`/`FNDA:` identity, only an aggregate `FNF`/`FNH` ' +
			'count per file per record, so this gate falls back to the maximum count seen across ' +
			'records for a file. That can still under-report true combined function coverage across ' +
			'several test files touching disjoint functions in the same file, the same class of gap ' +
			'this fix closes for lines -- disclosed here rather than silently left looking closed.',
	);

	if (!allPassed) {
		console.error('\n[test:coverage] FAILED: one or more workspaces have incomplete coverage.');
		process.exit(1);
	}

	console.log('\n[test:coverage] All workspaces report complete line and function coverage.');
}

// Sibling defect found while adding a regression test for this item: `parseLcov` and
// `mergeLcovRecordsByFile` needed to be exported and imported from a test file to be unit
// tested directly (per the same reasoning `doctor.ts`/`setup.ts` already export their own pure
// logic for), but this script previously ran `main()` -- which spawns a real `bun test
// --coverage` subprocess per workspace -- unconditionally at MODULE LOAD, with no
// `import.meta.main` guard. Importing this file for its pure functions therefore also
// triggered three full real coverage runs as a side effect, which is both slow (minutes) and
// wrong for a unit test. `doctor.ts` and `setup.ts` both already guard their own entrypoint
// this same way; this file was the one gap.
if (import.meta.main) {
	await main();
}
