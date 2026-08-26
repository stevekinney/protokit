import { describe, expect, it, mock } from 'bun:test';
import { createRequire as realCreateRequire } from 'node:module';
import { createLogger } from './logger';

/**
 * `canResolvePrettyTransport` (private to `logger.ts`) resolves
 * `pino-pretty` via `createRequire(...).resolve(...)` and falls back to
 * plain JSON output on failure -- the whole point being that a missing
 * `pino-pretty` (a devDependency, absent from the production image) must
 * never crash `createLogger()`. `pino-pretty` genuinely IS resolvable in
 * this dev/test environment, so every other test that calls `createLogger`
 * only exercises the success branch; nothing exercises the failure branch
 * without actually making resolution fail.
 *
 * `mock.module('node:module', ...)` swaps the LIVE BINDING `logger.ts`
 * already imported `createRequire` through -- it does not require
 * re-importing `logger.ts` itself (confirmed empirically: re-importing a
 * module fresh in-process resets Bun 1.3.14's coverage counters for that
 * file, see `env.test.ts`'s doc comment; patching only `node:module` and
 * calling the already-loaded `createLogger` avoids that entirely). The
 * mock passes every id through to the REAL `createRequire`/`resolve`
 * except `pino-pretty`, which it makes throw, and is restored to the real
 * implementation in `finally` so no other test in this shared process
 * (this workspace's `test` script has no `--isolate`) ever sees the
 * patched version.
 */
describe('createLogger (pino-pretty resolution failure fallback)', () => {
	it('still returns a working logger when pino-pretty cannot be resolved', () => {
		mock.module('node:module', () => ({
			createRequire: (url: string) => {
				const real = realCreateRequire(url);
				const patched = ((id: string) => real(id)) as NodeJS.Require;
				patched.resolve = ((id: string, options?: unknown) => {
					if (id === 'pino-pretty') {
						throw new Error('Cannot find module pino-pretty (mocked for this test)');
					}
					return (real.resolve as (id: string, options?: unknown) => string)(id, options);
				}) as NodeJS.RequireResolve;
				return patched;
			},
		}));

		try {
			expect(() => createLogger()).not.toThrow();
			const logger = createLogger();
			expect(typeof logger.info).toBe('function');
			expect(logger.level).toBeTruthy();
		} finally {
			mock.module('node:module', () => ({ createRequire: realCreateRequire }));
		}
	});

	it('resolves pino-pretty normally and still returns a working logger (unmocked baseline)', () => {
		const logger = createLogger();
		expect(typeof logger.info).toBe('function');
	});
});
