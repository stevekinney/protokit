import { describe, expect, it } from 'bun:test';
import { parseHostArgument } from '@web/connector-smoke-codex';

/**
 * `main()` is guarded by `import.meta.main`, so importing this module for
 * its pure `parseHostArgument` helper -- exactly what this file does -- does
 * not shell out to `codex` or self-host a real server. Everything else in
 * this file is live-orchestration behind that guard (see
 * `LINE_COVERAGE_WAIVED_FILES`'s Reason 1 in `scripts/assert-coverage-complete.ts`).
 */
describe('parseHostArgument', () => {
	it('returns the value following --host', () => {
		expect(parseHostArgument(['--host', 'https://example.com'])).toBe('https://example.com');
	});

	it('returns undefined when --host is not present', () => {
		expect(parseHostArgument([])).toBeUndefined();
		expect(parseHostArgument(['--other-flag', 'value'])).toBeUndefined();
	});

	it('returns undefined when --host is the last argument with no value', () => {
		expect(parseHostArgument(['--host'])).toBeUndefined();
	});

	it('uses the first --host occurrence when given more than one', () => {
		expect(
			parseHostArgument([
				'--host',
				'https://first.example.com',
				'--host',
				'https://second.example.com',
			]),
		).toBe('https://first.example.com');
	});
});
