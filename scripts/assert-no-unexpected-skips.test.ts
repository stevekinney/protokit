import { describe, expect, test } from 'bun:test';

import { countSkippedTests } from './assert-no-unexpected-skips.ts';

describe('countSkippedTests', () => {
	test('is zero for output with no skip line at all', () => {
		const output =
			' 586 pass\n 22 fail\n 1069 expect() calls\nRan 608 tests across 62 files. [36.04s]';
		expect(countSkippedTests(output)).toBe(0);
	});

	test('counts a single package skip line', () => {
		const output = ' 1 pass\n 1 skip\n 0 fail\n 1 expect() calls\nRan 2 tests across 1 file.';
		expect(countSkippedTests(output)).toBe(1);
	});

	test('sums skip lines across multiple turbo-prefixed package blocks', () => {
		const output = [
			'@template/mcp:test: 130 pass',
			'@template/mcp:test: 0 fail',
			'@template/web:test: 580 pass',
			'@template/web:test: 3 skip',
			'@template/web:test: 0 fail',
			'@template/database:test: 10 pass',
			'@template/database:test: 4 skip',
		].join('\n');
		expect(countSkippedTests(output)).toBe(7);
	});

	test('does not mistake a pass/fail count for a skip count', () => {
		const output = ' 12 pass\n 0 fail\n 0 skip\nRan 12 tests across 3 files.';
		expect(countSkippedTests(output)).toBe(0);
	});
});
