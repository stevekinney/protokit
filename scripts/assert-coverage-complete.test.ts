import { describe, expect, it } from 'bun:test';
import { mergeLcovRecordsByFile, parseLcov } from './assert-coverage-complete.ts';

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
