import { describe, expect, it } from 'bun:test';
import {
	assertExclusionsExist,
	findStaleWaivedLines,
	LINE_COVERAGE_WAIVED_FILES,
	LINE_COVERAGE_WAIVED_LINES,
	mergeLcovRecordsByFile,
	NEVER_IMPORTABLE_FILES,
	parseLcov,
	unwaivedUncoveredLines,
	WORKSPACES,
} from './assert-coverage-complete.ts';

describe('parseLcov', () => {
	it('parses SF/DA/FNF/FNH/end_of_record into per-line hit records', () => {
		const lcov = [
			'TN:',
			'SF:src/example.ts',
			'FNF:2',
			'FNH:1',
			'DA:1,5',
			'DA:2,0',
			'DA:3,3',
			'LF:3',
			'LH:2',
			'end_of_record',
		].join('\n');

		const [record] = parseLcov(lcov);
		expect(record).toBeTruthy();
		expect(record!.sourceFile).toBe('src/example.ts');
		expect(record!.functionsFound).toBe(2);
		expect(record!.functionsHit).toBe(1);
		expect([...record!.lineHits.entries()]).toEqual([
			[1, 5],
			[2, 0],
			[3, 3],
		]);
	});

	it('parses multiple SF blocks into separate records', () => {
		const lcov = [
			'SF:src/a.ts',
			'FNF:1',
			'FNH:1',
			'DA:1,1',
			'end_of_record',
			'SF:src/b.ts',
			'FNF:1',
			'FNH:0',
			'DA:1,0',
			'end_of_record',
		].join('\n');

		const records = parseLcov(lcov);
		expect(records).toHaveLength(2);
		expect(records[0]!.sourceFile).toBe('src/a.ts');
		expect(records[1]!.sourceFile).toBe('src/b.ts');
	});
});

describe('mergeLcovRecordsByFile', () => {
	// The exact defect from the review finding: two `--isolate` subprocess
	// records for the same file, each covering a DIFFERENT 5-of-10 lines.
	// Merging by taking the maximum linesHit across records reports 5/10
	// (max(5, 5)) for a file whose combined coverage is genuinely 10/10 --
	// this is the regression test for that bug.
	it('unions disjoint line coverage across records for the same file, rather than taking the maximum', () => {
		const records = [
			{
				sourceFile: 'src/example.ts',
				lineHits: new Map([
					[1, 1],
					[2, 1],
					[3, 1],
					[4, 1],
					[5, 1],
					[6, 0],
					[7, 0],
					[8, 0],
					[9, 0],
					[10, 0],
				]),
				functionsFound: 1,
				functionsHit: 1,
			},
			{
				sourceFile: 'src/example.ts',
				lineHits: new Map([
					[1, 0],
					[2, 0],
					[3, 0],
					[4, 0],
					[5, 0],
					[6, 1],
					[7, 1],
					[8, 1],
					[9, 1],
					[10, 1],
				]),
				functionsFound: 1,
				functionsHit: 0,
			},
		];

		const merged = mergeLcovRecordsByFile(records, 'workspace');
		const example = merged.get('src/example.ts');
		expect(example).toBeTruthy();
		// The bug: max(5, 5) = 5. The fix: every one of the 10 lines is hit
		// in at least one of the two records, so the union is 10/10.
		expect(example!.linesFound).toBe(10);
		expect(example!.linesHit).toBe(10);
	});

	it('still reports a genuinely uncovered line that no record ever hit', () => {
		const records = [
			{
				sourceFile: 'src/example.ts',
				lineHits: new Map([
					[1, 1],
					[2, 0],
				]),
				functionsFound: 0,
				functionsHit: 0,
			},
			{
				sourceFile: 'src/example.ts',
				lineHits: new Map([
					[1, 1],
					[2, 0],
				]),
				functionsFound: 0,
				functionsHit: 0,
			},
		];

		const merged = mergeLcovRecordsByFile(records, 'workspace');
		const example = merged.get('src/example.ts');
		expect(example!.linesFound).toBe(2);
		expect(example!.linesHit).toBe(1);
	});

	// Documents the disclosed, un-closed half of this fix: function coverage
	// has no per-function identity in Bun's lcov output, so it still uses
	// the maximum approximation and can still under-report a true union of
	// disjoint function coverage across records -- unlike lines, which this
	// fix makes a real union.
	it('still uses the maximum approximation for function coverage (no per-function identity available)', () => {
		const records = [
			{ sourceFile: 'src/example.ts', lineHits: new Map(), functionsFound: 2, functionsHit: 1 },
			{ sourceFile: 'src/example.ts', lineHits: new Map(), functionsFound: 2, functionsHit: 1 },
		];

		const merged = mergeLcovRecordsByFile(records, 'workspace');
		const example = merged.get('src/example.ts');
		// If these two records each hit a DIFFERENT one of the two
		// functions, the true union is 2/2 -- but this gate cannot know
		// that from Bun's lcov output, so it reports max(1, 1) = 1/2,
		// exactly as before this fix. This test pins that known limitation
		// rather than silently assuming it was also fixed.
		expect(example!.functionsFound).toBe(2);
		expect(example!.functionsHit).toBe(1);
	});

	it('resolves an absolute sourceFile path against the workspace directory, keyed the same as a relative one', () => {
		const records = [
			{
				sourceFile: '/repo/packages/database/src/example.ts',
				lineHits: new Map([[1, 1]]),
				functionsFound: 0,
				functionsHit: 0,
			},
		];

		const merged = mergeLcovRecordsByFile(records, '/repo/packages/database');
		expect(merged.has('src/example.ts')).toBe(true);
	});
});

// Post-merge coverage-gate round: retargets this gate to line coverage and
// file-level completeness only (see the end-of-run NOTE in this file's
// sibling `.ts` for the full rationale), and introduces the two explicit
// exclusion tiers below. These tests pin the shape of that retargeting
// directly, rather than only indirectly through a real `bun test --coverage`
// subprocess run.
describe('assertExclusionsExist', () => {
	it('does not throw for the real, current, workspace-qualified Tier A/B exclusion lists', () => {
		// Every listed path must resolve on disk right now -- this is the
		// actual regression this function guards against (a stale entry for
		// a file that was deleted or renamed), run against the real
		// repository layout, not a fixture.
		expect(() => assertExclusionsExist()).not.toThrow();
	});

	it('throws when a passed-in exclusion entry does not exist on disk', () => {
		expect(() =>
			assertExclusionsExist([
				'applications/web/src/this-file-does-not-exist-anywhere-in-the-repository.ts',
			]),
		).toThrow(/stale exclusion/);
	});

	it('does not throw for a real, workspace-qualified path that exists', () => {
		expect(() => assertExclusionsExist(['packages/database/src/env.ts'])).not.toThrow();
	});
});

describe('NEVER_IMPORTABLE_FILES / LINE_COVERAGE_WAIVED_FILES', () => {
	it('are disjoint -- a file is never exempt from appearing in the report AND exempt from full-line coverage at the same time', () => {
		for (const file of NEVER_IMPORTABLE_FILES) {
			expect(LINE_COVERAGE_WAIVED_FILES.has(file)).toBe(false);
		}
	});

	it('list every currently-known Tier A/B file explicitly, workspace-qualified, not via a pattern', () => {
		// Regression for the task's own standing rule: "a silent glob that
		// quietly hides future files is not acceptable." Both sets are plain
		// `Set<string>` literals of exact, workspace-qualified paths -- this
		// test pins that shape so a future refactor to a glob/regex, or a
		// regression back to a bare (non-workspace-qualified) key, is caught.
		expect(NEVER_IMPORTABLE_FILES).toBeInstanceOf(Set);
		expect(LINE_COVERAGE_WAIVED_FILES).toBeInstanceOf(Set);
		const workspaceDirectories = WORKSPACES.map((workspace) => workspace.directory);
		for (const file of [...NEVER_IMPORTABLE_FILES, ...LINE_COVERAGE_WAIVED_FILES]) {
			expect(typeof file).toBe('string');
			expect(file.includes('*')).toBe(false);
			expect(workspaceDirectories.some((directory) => file.startsWith(`${directory}/`))).toBe(true);
		}
	});

	// Regression for the exact defect found while adding these Tier A/B
	// entries: `applications/web/src/server.ts` (a real process entry point,
	// Tier A) and `packages/mcp/src/server.ts` (a real, normally-testable
	// server factory, NOT excluded) share the same `src`-relative path. A
	// bare, workspace-agnostic key would make listing one silently exempt
	// the other from ever being checked, in every workspace, by string
	// collision -- exactly the "gate concealing what it was built to catch"
	// failure this whole script exists to prevent.
	it('never lets a same-named file in one workspace exempt a different file of the same name in another workspace', () => {
		expect(NEVER_IMPORTABLE_FILES.has('applications/web/src/server.ts')).toBe(true);
		expect(NEVER_IMPORTABLE_FILES.has('packages/mcp/src/server.ts')).toBe(false);
		// Narrowed to a Tier B-narrow line waiver (review finding: a whole-file
		// waiver here would have hidden any OTHER uncovered line in this file) --
		// still exempt, just via the narrow map rather than the whole-file one.
		expect(LINE_COVERAGE_WAIVED_FILES.has('packages/mcp/src/server.ts')).toBe(false);
		expect(LINE_COVERAGE_WAIVED_LINES.has('packages/mcp/src/server.ts')).toBe(true);
		// And the reverse never-importable path must not leak into the OTHER
		// workspace's env.ts, in case a future edit tried the same shortcut.
		expect(NEVER_IMPORTABLE_FILES.has('applications/web/src/env.ts')).toBe(false);
		// Same narrowing as `server.ts` above. These two `env.ts` files are
		// each fully covered except their `SKIP_ENV_VALIDATION` guard body,
		// which runs at module scope and so is only reachable from a
		// subprocess.
		expect(LINE_COVERAGE_WAIVED_FILES.has('applications/web/src/env.ts')).toBe(false);
		expect(LINE_COVERAGE_WAIVED_LINES.has('applications/web/src/env.ts')).toBe(true);
		expect(LINE_COVERAGE_WAIVED_FILES.has('packages/database/src/env.ts')).toBe(false);
		expect(LINE_COVERAGE_WAIVED_LINES.has('packages/database/src/env.ts')).toBe(true);
		// `packages/mcp/src/env.ts` was a third entry here, asserted to hold a
		// narrow line waiver for the same guard body. It no longer has one, and
		// must not: TRI-75 moved that guard out of module scope and into
		// `parseMcpServerEnvironment`, where a test calls it directly. The
		// waived lines became genuinely covered, so keeping the waiver would be
		// exactly the stale exemption this gate reports as "a waiver nobody
		// re-examines is how a real gap hides". Asserted as absent rather than
		// deleted, so re-adding a waiver for this file fails here.
		expect(LINE_COVERAGE_WAIVED_FILES.has('packages/mcp/src/env.ts')).toBe(false);
		expect(LINE_COVERAGE_WAIVED_LINES.has('packages/mcp/src/env.ts')).toBe(false);
		// The workspace-scoping property this test exists for is unaffected:
		// three distinct `src/env.ts` paths still resolve independently, and
		// the two that are waived are waived by their own full workspace key.
		expect(NEVER_IMPORTABLE_FILES.has('packages/mcp/src/env.ts')).toBe(false);
		expect(NEVER_IMPORTABLE_FILES.has('packages/database/src/env.ts')).toBe(false);
	});
});

describe('line-specific coverage waivers', () => {
	const waived = new Map([['workspace/src/example.ts', new Set([10, 20])]]);

	it('excuses exactly the waived lines and nothing else', () => {
		expect(unwaivedUncoveredLines('workspace/src/example.ts', [10, 20], waived)).toEqual([]);
	});

	it('still fails on an uncovered line the waiver does not name', () => {
		// The point of a line-specific waiver: excusing one unreachable brace
		// must not stop the gate noticing the next real gap in the same file.
		expect(unwaivedUncoveredLines('workspace/src/example.ts', [10, 20, 31], waived)).toEqual([31]);
	});

	it('leaves a file with no waiver entry completely unexcused', () => {
		expect(unwaivedUncoveredLines('workspace/src/other.ts', [5, 6], waived)).toEqual([5, 6]);
	});

	it('reports a waived line that is now covered as stale', () => {
		// Line 10 no longer appears as uncovered, so its waiver is obsolete.
		expect(findStaleWaivedLines('workspace/src/example.ts', [20], waived)).toEqual([10]);
	});

	it('reports nothing stale while every waived line is still uncovered', () => {
		expect(findStaleWaivedLines('workspace/src/example.ts', [10, 20], waived)).toEqual([]);
	});

	it('reports nothing stale for a file that has no waiver', () => {
		expect(findStaleWaivedLines('workspace/src/other.ts', [], waived)).toEqual([]);
	});
});
