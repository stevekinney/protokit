import { describe, expect, it } from 'bun:test';
import { EXCLUDED_FROM_EXECUTION, SAFE_TO_EXECUTE } from './test-documentation-commands.js';

describe('SAFE_TO_EXECUTE / EXCLUDED_FROM_EXECUTION classification', () => {
	it('never classifies the same script name as both safe and excluded', () => {
		const overlap = Object.keys(SAFE_TO_EXECUTE).filter((name) => name in EXCLUDED_FROM_EXECUTION);
		expect(overlap).toEqual([]);
	});

	it('gives every excluded command a non-empty reason', () => {
		for (const [name, reason] of Object.entries(EXCLUDED_FROM_EXECUTION)) {
			expect(reason.length > 0).toBe(true);
			void name;
		}
	});

	it("never excludes a shared-infrastructure-starting command from the exclusion list itself — regression guard for BUG in this repository's own past", () => {
		// This repository's shared constraint: never start/stop/migrate the
		// shared test stack from an unattended check. Assert the three exact
		// commands are excluded, not merely present in the map.
		expect(EXCLUDED_FROM_EXECUTION['test:infrastructure:up']).toBeDefined();
		expect(EXCLUDED_FROM_EXECUTION['test:infrastructure:down']).toBeDefined();
		expect(EXCLUDED_FROM_EXECUTION['test:infrastructure:migrate']).toBeDefined();
		expect(EXCLUDED_FROM_EXECUTION['test:container-smoke']).toBeDefined();
	});

	it('never treats a mutating command (format, db:generate) as safe to execute', () => {
		expect(SAFE_TO_EXECUTE['format']).toBeUndefined();
		expect(SAFE_TO_EXECUTE['db:generate']).toBeUndefined();
	});

	it('gives every safe command a real bun invocation shape', () => {
		for (const spec of Object.values(SAFE_TO_EXECUTE)) {
			expect(spec.command).toBe('bun');
			expect(spec.args.length > 0).toBe(true);
		}
	});
});
