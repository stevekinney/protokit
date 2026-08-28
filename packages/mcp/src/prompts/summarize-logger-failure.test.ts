import { describe, expect, it, mock } from 'bun:test';

/**
 * `summarize.ts`'s handler wraps its own logging calls in a try/catch and
 * falls back to a generic "An error occurred..." message rather than ever
 * throwing (this package's own contract for prompt handlers -- see
 * `CLAUDE.md`'s "Prompts must never throw"). Nothing in the topic or
 * context can trigger that path -- the only thing inside the `try` that can
 * realistically throw is the logging call itself -- so this test monkey-
 * patches the real, singleton `logger.child` (restored in `finally`, same
 * pattern `summarize.test.ts`'s own logging test already uses for
 * `logger.info`) to return a child whose `.info`/`.warn` throw, forcing the
 * handler through its own `catch` block and proving both the fallback
 * message and the `requestLogger.error(...)` call actually happen.
 *
 * Deliberately does NOT `mock.module('../logger.js', ...)` here: that
 * replaces the whole module for the rest of the (global, cross-file) test
 * run, and a replacement lacking `createLogger` broke
 * `summarize-diagnostics.test.ts` (confirmed empirically) purely from
 * import-order luck between files. Monkey-patching one method on the real
 * exported singleton, then restoring it, cannot leak that way.
 */
mock.module('../env.js', () => ({
	// `env.js` exports parsing functions rather than a pre-parsed
	// `environment` object. The stub returns a complete environment because
	// `logger.ts` imports this same module and reads `LOG_LEVEL` and
	// `NODE_ENV` from it when the logger is first built -- a partial stub
	// leaves this file passing only when some other test file happens to
	// have installed a compatible mock first.
	getEnvironment: () => ({
		NODE_ENV: 'test',
		LOG_LEVEL: 'info',
		MCP_SERVER_NAME: 'template-mcp-server',
		MCP_CONFORMANCE_MODE: false,
		LOG_CONTENT_DIAGNOSTICS_UNTIL: undefined,
	}),
}));

const { summarizePrompt } = await import('./summarize.js');
const { createTestContext } = await import('../testing/context.js');
const { logger } = await import('../logger.js');

describe('summarizePrompt (a logging failure inside the handler is caught, never thrown)', () => {
	it('returns the fallback message and logs the failure via requestLogger.error', async () => {
		const errorCalls: unknown[] = [];
		const originalChild = logger.child.bind(logger);
		logger.child = ((bindings: Record<string, unknown>) => {
			const realChild = originalChild(bindings);
			return {
				...realChild,
				info: () => {
					throw new Error('logging backend unavailable');
				},
				warn: () => {
					throw new Error('logging backend unavailable');
				},
				error: (...args: unknown[]) => {
					errorCalls.push(args[0]);
				},
			};
		}) as typeof logger.child;

		try {
			const context = createTestContext();
			const result = await summarizePrompt.handler({ topic: 'anything' }, context);

			expect(result.messages).toHaveLength(1);
			expect(result.messages[0]?.content.text).toBe(
				'An error occurred while generating the prompt.',
			);

			expect(errorCalls).toHaveLength(1);
			const errorCall = errorCalls[0] as { err?: unknown };
			expect(errorCall.err).toBeInstanceOf(Error);
			expect((errorCall.err as Error).message).toBe('logging backend unavailable');
		} finally {
			logger.child = originalChild;
		}
	});
});
