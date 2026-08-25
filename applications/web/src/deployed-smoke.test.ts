import { describe, expect, it } from 'bun:test';

/**
 * `deployed-smoke.ts` exports nothing -- every check it performs lives
 * inside `main()`, which genuinely needs a real, publicly reachable
 * deployment (public DNS resolution, a real TLS chain validated from
 * outside the deployment network) and cannot be honestly exercised by
 * `bun test`. What CAN be proven here, and is worth proving on its own,
 * is the file's own documented guard: its header comment states that
 * without `if (import.meta.main)`, merely importing this module would run
 * the real `main()` against `process.argv` and `process.exit()` the
 * importing process -- exactly the defect this test would catch if that
 * guard were ever removed or misapplied. A real dynamic import, not a
 * static one, so this assertion actually exercises module evaluation
 * rather than relying on it having already happened before this test file
 * runs.
 */
describe('deployed-smoke module import', () => {
	it('does not run main() or exit the process merely by being imported', async () => {
		const loaded = await import('@web/deployed-smoke');
		expect(loaded).toBeDefined();
	});
});
