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

export interface WorkspaceTarget {
	readonly name: string;
	readonly directory: string;
}

export const WORKSPACES: readonly WorkspaceTarget[] = [
	{ name: '@template/database', directory: 'packages/database' },
	{ name: '@template/mcp', directory: 'packages/mcp' },
	{ name: '@template/web', directory: 'applications/web' },
];

/**
 * TEST-001 (post-merge coverage-gate round): two explicit, reasoned tiers
 * of exception to "every `src` file must appear in the coverage report
 * with every line hit" -- never a silent glob, and never a bare filename
 * with no reason attached.
 *
 * Every entry is `<workspace.directory>/<path-under-src>`, e.g.
 * `applications/web/src/server.ts` -- WORKSPACE-QUALIFIED, not merely
 * workspace-relative. This is load-bearing, not stylistic: `src/server.ts`
 * and `src/env.ts` each name a REAL, DIFFERENT file in more than one
 * workspace (`applications/web`'s real process entry point vs.
 * `packages/mcp`'s real, normally-testable server factory; three
 * independent `SKIP_ENV_VALIDATION` guards, one per workspace). An earlier
 * version of this file kept a single flat, workspace-agnostic set and
 * checked it with `.has(sourceFile)` inside the per-workspace loop below --
 * which meant listing `applications/web/server.ts` as never-importable
 * ALSO silently exempted `packages/mcp/server.ts` (a real, normal,
 * fully-testable module) from ever being checked at all, in every
 * workspace, by simple string collision. Qualifying every key by its
 * workspace directory makes that collision structurally impossible: two
 * files that happen to share a `src`-relative path are two different Map
 * keys here, exactly as they are two different files on disk.
 *
 * `assertExclusionsExist` below fails the run if a listed path no longer
 * exists on disk -- an exclusion for a file that was since deleted or
 * renamed is a stale entry silently hiding nothing, which is exactly the
 * "gate concealing what it was built to catch" failure mode this script
 * exists to prevent.
 *
 * TIER A -- "never importable": these files run real, unconditional,
 * top-level side effects at module load (binding a real port, calling
 * `Bun.build`, mutating the DOM) or are driven by a runner other than
 * `bun test` entirely (Playwright's `.e2e.ts` scripts, run by `bunx
 * playwright test`), or are erased entirely at compile time (a type-only
 * module -- there is no runtime module left for the coverage instrumenter
 * to attach to, confirmed empirically: even a real test importing one
 * produces no `SF:` record at all). Importing any of the side-effecting
 * ones from a test file would not exercise their logic under test -- it
 * would run the real program. Exempt from the "must appear in the coverage
 * report at all" check.
 */
export const NEVER_IMPORTABLE_FILES: ReadonlySet<string> = new Set([
	// applications/web -- real process entry points and build tooling.
	'applications/web/src/server.ts', // Binds a real port and installs real SIGTERM/SIGINT/uncaughtException handlers at module load; no `import.meta.main` guard, by design (this *is* the process entry point).
	'applications/web/src/build.ts', // Runs the real production `Bun.build` pipeline (writes to `dist/`) unconditionally at module load; no `export` worth importing for.
	'applications/web/src/client/entry.ts', // Browser-runtime entry: reads `document.getElementById` at module load. Bun's `bun test` environment has no DOM; this file is never evaluated there, by construction (see `applications/web/CLAUDE.md`'s client/server boundary).
	'applications/web/src/end-to-end-tests/hydration.e2e.ts', // Playwright spec, run by `bunx playwright test` (`test:end-to-end`), never by `bun test` -- has its own runner and its own gate.
	'applications/web/src/end-to-end-tests/interactive-components.e2e.ts',
	'applications/web/src/end-to-end-tests/streaming.e2e.ts',
	// applications/web -- BLOCKED, not exempt by design: both connector-smoke
	// harnesses call `await main()` unconditionally at module load, with no
	// `import.meta.main` guard (unlike their four siblings -- `deployed-oauth.ts`,
	// `deployed-smoke.ts`, `deployed-streaming.ts`, `connector-smoke-inspector.ts`
	// -- which all have one specifically so a test file CAN import their pure
	// helpers without triggering a real run). Importing either file from a test
	// would self-host a real server and shell out to a real `codex`/`claude` CLI.
	// This is a source defect, not a genuinely unmeasurable file: the fix is a
	// one-line `if (import.meta.main) { await main(); }` guard around the
	// existing `await main();` call, mirroring the four siblings exactly. Not
	// applied here -- `applications/web/src/{connector-smoke-claude-code,connector-smoke-codex}.ts`
	// are outside this script's file lane (test files and this script only).
	// Listed here, with this reason, so the exclusion is explicit rather than
	// this file silently vanishing from the report.
	'applications/web/src/connector-smoke-claude-code.ts',
	'applications/web/src/connector-smoke-codex.ts',
	// applications/web -- real, unconditional side effects at module load:
	// `await buildStyles()`/`buildClientBundle()`/`writeStableManifest()`, a
	// real `fs.watch`, and a real `Bun.spawn(['bun', '--watch', ...])` that
	// starts a real dev server -- with no `import.meta.main` guard anywhere
	// in the file (confirmed by direct read). The `bun run dev` entry point
	// analog to `server.ts`/`build.ts`; same reasoning as those two.
	'applications/web/src/development.ts',
	// applications/web -- type-only modules. Confirmed empirically: even a
	// test file that imports one of these produces NO `SF:` record at all in
	// Bun's lcov output, because a type-only import is fully erased at
	// compile time -- there is no module evaluation for the coverage
	// instrumenter to attach to. This is a different failure shape than
	// "never imported by any test" (the file IS imported, repeatedly, by
	// several real test files) but produces the identical symptom this gate
	// exists to catch (invisible to the report), so it gets the same
	// treatment: an explicit, reasoned exclusion, not a silent gap.
	'applications/web/src/lib/request-context.ts', // `RequestContext` -- `export type` only, no runtime code.
	'applications/web/src/types/user.ts', // `ApplicationUser` -- `export type` only, no runtime code.
	'applications/web/src/components/home-page.types.ts', // `ConnectionSummaryView`/`HomePageUser`/`HomePageProps` -- `export type` only, no runtime code.
	'applications/web/src/views/oauth-authorize-page.types.ts', // `OAuthAuthorizePageScope`/`OAuthAuthorizePageInput` -- `export type` only, no runtime code.
	// applications/web -- CSS-collection bundler input. `style-entry.ts` exists
	// purely to be a graph `build.ts` walks with `Bun.build({ target:
	// 'browser' })` to collect every page's Cinder CSS; it is never imported as
	// a module by any test -- `style-entry.test.ts` reads its source as text
	// (`Bun.file(...).text()`) and asserts the import list textually rather
	// than importing the file itself, specifically so asserting "every page is
	// listed" doesn't require actually resolving and rendering every `.svelte`
	// component through it.
	'applications/web/src/styles/style-entry.ts',
	// packages/mcp -- a real standalone conformance server. NOTE: this is a
	// DIFFERENT file from `applications/web/src/server.ts` above, and this
	// key correctly does not collide with it (see this block's header
	// comment) -- `packages/mcp/src/server.ts` (the server FACTORY,
	// `createMcpServer`) remains fully required to appear and be covered.
	'packages/mcp/src/conformance-server.ts', // Calls `server.listen(...)` unconditionally at module load (binds a real port); a standalone process for local/CI protocol conformance runs, not a module with logic to unit test.
]);

/**
 * TIER B -- "import required, full-line coverage waived": every file here
 * DOES appear in the coverage report (a real test imports it -- going
 * invisible again would be the exact regression this gate exists to catch)
 * but is not held to 100% of its lines, for one of three distinct, disclosed
 * reasons named per entry below. Function-count is still reported for these
 * files too (see the end-of-run NOTE for why function coverage is advisory
 * only everywhere). Keys are workspace-qualified for the same reason
 * `NEVER_IMPORTABLE_FILES` above is -- `env.ts` in particular names a real,
 * different file with the identical guard pattern in all three workspaces.
 *
 *  1. Live-deployment-only orchestration: a `main()` function, guarded by
 *     `if (import.meta.main)` specifically so it CAN be imported without
 *     running, whose own body drives a real deployed host, a real OAuth
 *     browser consent flow, or a real MCP Inspector CLI install -- none of
 *     which `bun test` can honestly exercise.
 *  2. A `SKIP_ENV_VALIDATION` fail-closed guard (CONFIG-001/BUG-001) that
 *     throws before any other code runs, and is therefore only reachable by
 *     evaluating the module fresh -- which a real subprocess (`Bun.spawn`)
 *     is the only safe way to do without corrupting the parent process's own
 *     coverage instrumentation for that file. Confirmed empirically, twice
 *     independently (`packages/mcp/src/env.test.ts`'s original author, and
 *     `applications/web/src/env-skip-validation-guard.test.ts`'s): re-importing
 *     the same source file in-process (via a cache-busting query string) to
 *     re-trigger the top-level throw does not UNION with the already-recorded
 *     happy-path coverage for that file -- it RESETS the file's line-hit
 *     counters, wiping out legitimate coverage of the success path. A real
 *     subprocess test proves the guard's behavior correctly but is invisible
 *     to the parent process's `--coverage` collector by construction.
 *  3. A line proven unreachable by direct evidence -- reading the pinned
 *     dependency's own installed source, or reading this codebase's own
 *     control flow -- not merely "I couldn't find a test for it."
 */
export const LINE_COVERAGE_WAIVED_FILES: ReadonlySet<string> = new Set([
	// Reason 1: live-deployment-only orchestration.
	'applications/web/src/deployed-oauth.ts', // `main()`: real DCR against a real host, a real loopback OAuth round trip. Pure helpers (`generatePkcePair`, `startLoopbackCallbackListener`, `checkAuthorizeRedirectsToSignIn`) are covered by `deployed-oauth.test.ts`.
	'applications/web/src/deployed-smoke.ts', // `main()`: real HTTP probes against a real deployed host.
	'applications/web/src/deployed-streaming.ts', // `main()`: opens a real SSE stream against a real deployed host and measures real wall-clock chunk timing. Pure helpers (`parseArguments`, `detectStreamBuffering`) are covered by `deployed-streaming.test.ts`.
	'applications/web/src/connector-smoke-inspector.ts', // `main()`: self-hosts a real server and shells out to the real `@modelcontextprotocol/inspector` CLI via `bunx`. `runAuthenticatedInspectorCheck`/`obtainRealAccessToken` are covered by `connector-smoke-inspector.test.ts` against real Postgres.

	// Reason 2: `SKIP_ENV_VALIDATION` fail-closed guard, subprocess-only
	// reachable. Three independent files, one per workspace, each with its
	// own copy of the identical guard (CONFIG-001/BUG-001 -- deliberately
	// duplicated per-package rather than shared, so each package's `env.ts`
	// stays independently readable).
	'applications/web/src/env.ts', // Lines 10-13, `if (process.env.SKIP_ENV_VALIDATION) throw ...`. Real behavior proven by `src/env-skip-validation-guard.test.ts` (a real `Bun.spawn` subprocess).
	'packages/database/src/env.ts', // Lines 9-11, identical guard and identical subprocess-only-reachable reason.
	'packages/mcp/src/env.ts', // Lines 9-11 (guard) and 39-41 (production-only companion check), identical reason.

	// Reason 3: proven-unreachable lines, cited with the specific evidence.
	'applications/web/src/lib/trusted-proxy.ts', // Line 180, the closing brace of `extractForwardedAddress`'s `'forwarded'`-header branch. Every statement inside that branch (the lines immediately above) is fully hit, 51-68 times each in a real full-suite run; only this specific closing brace never registers, while the structurally identical closing braces of the other two branches in the same function do. Reproduces in complete isolation (this file's own test file run alone, no other test file involved) -- a Bun/SWC coverage-instrumentation artifact on this exact brace, not a real code gap.
	'packages/mcp/src/conformance-fixture-registration.ts', // Lines 21-22 (`delay()`'s already-aborted branch -- `runWithStandardizedTimeout` always hands `delay` a freshly-constructed, unaborted signal) and lines 255-263, 315-320, 372-377, 430-435 (the `!sendRequest` branches in `test_sampling`/`test_elicitation*` -- every real per-request `ctx.mcpReq` the installed `@modelcontextprotocol/server@2.0.0` SDK builds always attaches a `send` function unconditionally, confirmed by reading that SDK's source directly and by testing against legacy HTTP, modern-era HTTP, and `InMemoryTransport` transports alike).
	'packages/mcp/src/server.ts', // Line 248, the MCP-Apps experimental-capability branch -- unreachable because `hasRegisteredUiExtensionResource()` always returns `false` today; no MCP App is registered anywhere in this codebase yet. NOTE: this is `createMcpServer`, a different file from `applications/web/src/server.ts` (see `NEVER_IMPORTABLE_FILES`'s header comment) -- every other line here is required and covered.
]);

/**
 * TIER B-narrow -- "these exact lines, and nothing else."
 *
 * `LINE_COVERAGE_WAIVED_FILES` above exempts a whole file, which is the right
 * shape for a file whose `main()` only runs against a live deployment. It is
 * the WRONG shape for an otherwise fully covered file that has one
 * genuinely-unreachable line: waiving the file to excuse one brace also stops
 * the gate ever noticing the next real gap in it, silently, forever. That is
 * the "green for the wrong reason" failure this gate exists to prevent,
 * arriving through the exclusion list instead of through the metric.
 *
 * An entry here waives the named lines only. Any OTHER uncovered line in the
 * same file still fails the gate, and a waived line that becomes covered is
 * reported as stale so the waiver gets removed rather than accumulating.
 */
export const LINE_COVERAGE_WAIVED_LINES: ReadonlyMap<string, ReadonlySet<number>> = new Map([
	[
		// Two defense-in-depth guards inside the SDK server factory, both
		// unreachable through the only entry point that reaches them.
		// `handleMcpRequest` calls `readMcpRequestAuthExtra(authInfo)` and
		// returns before dispatch if it fails, then looks the handler up by
		// `requestAuthExtra.userId` -- so by the time the SDK invokes the
		// factory with that same `authInfo`, the extra is necessarily present
		// (line 88) and its `userId` is necessarily the one the closure was
		// built for (line 96). Deliberately kept as code rather than deleted:
		// silently serving either case would be the cross-user delivery bug
		// (S-11) the per-user handler cache exists to prevent.
		//
		// Line 293 is the closing brace of the `PayloadTooLargeError` branch,
		// immediately after its `return`. Every line of that return body
		// registers real hits from the oversized-body test; only the brace
		// never does -- the same Bun/SWC instrumentation artifact already
		// documented for `trusted-proxy.ts` line 180.
		'applications/web/src/lib/mcp-handler.ts',
		new Set([88, 96, 293]),
	],
	[
		// `runHarnessMain`'s body. It ends in `process.exit(1)`, so it cannot
		// run in-process without either stubbing `process.exit` (which would
		// prove the stub works, not the harness) or tearing down the test
		// runner. `connector-smoke-support.test.ts` drives it through four real
		// `Bun.spawn` subprocesses instead, asserting the exit code, the
		// operator-facing message, and specifically the ABSENCE of a
		// `node_modules` stack trace -- the defect it was written to fix.
		// Coverage instrumentation does not follow a subprocess, so the lines
		// stay at zero however thoroughly they are exercised. Same reason as
		// the `SKIP_ENV_VALIDATION` guards in Tier B above.
		'applications/web/src/connector-smoke-support.ts',
		new Set([279, 280, 281, 282, 283, 284, 285, 286, 287, 288]),
	],
]);

/**
 * Reports waived lines that are now covered. A stale waiver is not harmless:
 * it is a standing exemption nobody re-examines, and the line it names may
 * have moved to cover something that genuinely is not tested.
 */
export function findStaleWaivedLines(
	workspaceQualifiedPath: string,
	uncoveredLineNumbers: readonly number[],
	waivedLines: ReadonlyMap<string, ReadonlySet<number>> = LINE_COVERAGE_WAIVED_LINES,
): number[] {
	const waived = waivedLines.get(workspaceQualifiedPath);
	if (!waived) return [];
	const uncovered = new Set(uncoveredLineNumbers);
	return [...waived].filter((lineNumber) => !uncovered.has(lineNumber)).sort((a, b) => a - b);
}

/**
 * The uncovered lines in this file that no waiver excuses. An empty result
 * means the file passes, whether that is because it is fully covered or
 * because every gap is individually accounted for.
 */
export function unwaivedUncoveredLines(
	workspaceQualifiedPath: string,
	uncoveredLineNumbers: readonly number[],
	waivedLines: ReadonlyMap<string, ReadonlySet<number>> = LINE_COVERAGE_WAIVED_LINES,
): number[] {
	const waived = waivedLines.get(workspaceQualifiedPath) ?? new Set<number>();
	return uncoveredLineNumbers.filter((lineNumber) => !waived.has(lineNumber));
}

export function assertExclusionsExist(
	// Defaults to the real Tier A/B sets; overridable so this stale-entry
	// check is directly unit-testable against synthetic entries, rather than
	// only indirectly through the real, current exclusion lists. Keys are
	// workspace-qualified (`<workspace.directory>/<path>`), so this check no
	// longer needs a `WorkspaceTarget` argument or a per-workspace loop --
	// each key states its own workspace up front.
	exclusions: Iterable<string> = [...NEVER_IMPORTABLE_FILES, ...LINE_COVERAGE_WAIVED_FILES],
): void {
	for (const workspaceQualifiedPath of exclusions) {
		try {
			statSync(workspaceQualifiedPath);
		} catch {
			throw new Error(
				`[test:coverage] stale exclusion: "${workspaceQualifiedPath}" is listed in this script's ` +
					'Tier A/B exclusion set but does not exist on disk. Remove it -- an exclusion for a file ' +
					'that no longer exists hides nothing and is dead weight.',
			);
		}
	}
}

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
	/**
	 * The specific line numbers with zero hits after merging, so a waiver can
	 * name the lines it excuses instead of exempting a whole file. See
	 * `LINE_COVERAGE_WAIVED_LINES`.
	 */
	readonly uncoveredLineNumbers: readonly number[];
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
			uncoveredLineNumbers: [...value.lineHits.entries()]
				.filter(([, hitCount]) => hitCount === 0)
				.map(([lineNumber]) => lineNumber)
				.sort((left, right) => left - right),
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
			// Workspace-qualified key -- see `NEVER_IMPORTABLE_FILES`'s header
			// comment for why this must never be a bare, workspace-agnostic
			// `sourceFile` lookup (a real collision: `src/server.ts` and
			// `src/env.ts` each name a different, real file in more than one
			// workspace).
			const workspaceQualifiedPath = join(workspace.directory, sourceFile);
			if (NEVER_IMPORTABLE_FILES.has(workspaceQualifiedPath)) continue;

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

			// The task decision this gate implements: enforce line coverage and
			// file-level completeness -- what Bun's `--isolate` lcov output can
			// honestly measure as a real union (see `mergeLcovRecordsByFile`'s
			// doc comment). Function coverage is reported below but no longer a
			// hard failure: Bun never emits per-function `FN:`/`FNDA:` identity
			// (see `parseLcov`'s doc comment), so a file's function count across
			// several `--isolate` subprocess records is a MAXIMUM, not a true
			// union -- not an honest metric to gate a release on. Line coverage
			// keeps its real per-line union and stays enforced.
			if (
				record.linesFound > 0 &&
				record.linesHit < record.linesFound &&
				!LINE_COVERAGE_WAIVED_FILES.has(workspaceQualifiedPath)
			) {
				const unwaived = unwaivedUncoveredLines(
					workspaceQualifiedPath,
					record.uncoveredLineNumbers,
				);
				if (unwaived.length > 0) {
					console.error(
						`[test:coverage] ${workspace.name}: ${sourceFile} has ${unwaived.length} uncovered line(s) (${record.linesHit}/${record.linesFound}); lines ${unwaived.join(', ')}`,
					);
					workspaceFailed = true;
				}
			}
			const staleWaivedLines = findStaleWaivedLines(
				workspaceQualifiedPath,
				record.uncoveredLineNumbers,
			);
			if (staleWaivedLines.length > 0) {
				console.error(
					`[test:coverage] ${workspace.name}: ${sourceFile} waives line(s) ${staleWaivedLines.join(', ')} that are now covered. Remove them from LINE_COVERAGE_WAIVED_LINES -- a waiver nobody re-examines is how a real gap hides.`,
				);
				workspaceFailed = true;
			}
			if (record.functionsFound > 0 && record.functionsHit < record.functionsFound) {
				console.log(
					`[test:coverage] ${workspace.name}: NOTE (not gated) ${sourceFile} has ${record.functionsFound - record.functionsHit} uncovered function(s) per Bun's max-across-records approximation (${record.functionsHit}/${record.functionsFound})`,
				);
			}
		}
	} finally {
		rmSync(coverageDirectory, { recursive: true, force: true });
	}

	return !workspaceFailed;
}

async function main(): Promise<void> {
	assertExclusionsExist();

	let allPassed = true;

	for (const workspace of WORKSPACES) {
		console.log(`\n[test:coverage] === ${workspace.name} ===`);
		const passed = await runCoverageForWorkspace(workspace);
		if (!passed) allPassed = false;
	}

	console.log(
		'\n[test:coverage] NOTE: this gate is deliberately retargeted to what Bun 1.3.14 can measure ' +
			'honestly on the installed toolchain -- line coverage (a real per-line union across ' +
			"`--isolate` subprocess records, via each record's `DA:` entries) and file-level " +
			'completeness (every `src` file must appear in the report, except the explicit, reasoned ' +
			'Tier A/B exclusions in this script -- see `NEVER_IMPORTABLE_FILES`/`LINE_COVERAGE_WAIVED_FILES`). ' +
			'Two metrics the roadmap\'s "line, function, statement, and branch coverage" criterion names ' +
			'are NOT enforced here, each for a distinct, disclosed reason (see TEST-001 in ' +
			'PROGRESS.local.md and the same criterion in ROADMAP.local.md for the full record): ' +
			'branch coverage has no metric at all on this toolchain -- `bun test --coverage` never ' +
			'emits a branch column, in any workspace, full stop, so there is nothing to gate. Function ' +
			'coverage IS emitted, but only as an aggregate `FNF`/`FNH` count per file per record -- ' +
			'Bun never emits per-function `FN:`/`FNDA:` identity, so combining several `--isolate` ' +
			'subprocess records can only take the MAXIMUM count seen, not a true union; two records ' +
			"that each exercise a different half of a file's functions both under-report, and the max " +
			'of two under-reports is still an under-report. Gating a release on a number that can ' +
			'under-report its own truth is the "green for the wrong reason" failure this whole gate ' +
			'exists to prevent, so function coverage is now printed as an advisory NOTE per file above, ' +
			'never a hard failure. "Statement coverage" is not a metric Bun\'s coverage reporter ' +
			'produces under any name (only line and function counts) and was never separately ' +
			'enforceable by this script in the first place.',
	);

	if (!allPassed) {
		console.error('\n[test:coverage] FAILED: one or more workspaces have incomplete coverage.');
		process.exit(1);
	}

	console.log(
		'\n[test:coverage] All workspaces report complete line coverage and file-level completeness.',
	);
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
