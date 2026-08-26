import { describe, expect, it } from 'bun:test';
import { environment } from '@web/env';

/**
 * The `SKIP_ENV_VALIDATION` throw-guard test lives in its own file
 * (`env-skip-validation-guard.test.ts`), not here. Empirically confirmed:
 * that test's `await import('./env.ts?skip-env-validation-throw-...')`
 * forces Bun to recompile and re-instrument `env.ts` as a fresh module
 * instance, which RESETS this source file's coverage counters back to
 * zero for every line -- including the ones this file's own top-level
 * `import { environment } from '@web/env'` already exercised. Keeping the
 * two in separate files (the suite runs with `--isolate`, so each file is
 * its own process) means that reset can never clobber this file's real
 * coverage of the happy-path `environmentalist.sync(...)` call. Mirrors
 * `resolve-public-file-realpath-failure.test.ts`'s identical reason for
 * isolating a module-reloading test into its own file.
 */
describe('environment', () => {
	it('validates the real test-process environment and exposes its typed values', () => {
		expect(environment.nodeEnv).toBe('test');
		expect(typeof environment.sessionCookieName).toBe('string');
		expect(environment.sessionCookieName.length).toBeGreaterThan(0);
	});
});
