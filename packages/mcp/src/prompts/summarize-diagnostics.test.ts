import { describe, expect, it, mock } from 'bun:test';

/**
 * OBS-001 / S-14: the explicit, time-bounded diagnostic mode. A separate
 * file (not added to `summarize.test.ts`) because it needs `../env.js`
 * mocked before `summarize.ts` is imported — matching this codebase's
 * established `mock.module(...)` + top-level dynamic `import(...)` pattern
 * (see `applications/web/src/lib/mcp-handler.test.ts`).
 */
mock.module('../env.js', () => ({
	environment: {
		LOG_CONTENT_DIAGNOSTICS_UNTIL: '2099-01-01T00:00:00Z',
	},
}));

const { summarizePrompt } = await import('./summarize.js');
const { logger } = await import('../logger.js');
const { createTestContext } = await import('../testing/context.js');

describe('summarizePrompt logging (OBS-001, diagnostics active)', () => {
	it('logs the raw topic and an audit line when the diagnostic window has not expired', async () => {
		const infoCalls: unknown[] = [];
		const warnCalls: unknown[] = [];
		const originalInfo = logger.info.bind(logger);
		const originalWarn = logger.warn.bind(logger);
		logger.info = ((...args: Parameters<typeof logger.info>) => {
			infoCalls.push(args[0]);
			return originalInfo(...args);
		}) as typeof logger.info;
		logger.warn = ((...args: Parameters<typeof logger.warn>) => {
			warnCalls.push(args[0]);
			return originalWarn(...args);
		}) as typeof logger.warn;

		try {
			const context = createTestContext();
			await summarizePrompt.handler({ topic: 'diagnostics-mode-topic' }, context);

			const promptRequestedCall = infoCalls.find(
				(call) => typeof call === 'object' && call !== null && 'topic' in (call as object),
			) as Record<string, unknown> | undefined;
			expect(promptRequestedCall?.topic).toBe('diagnostics-mode-topic');

			// The mode's use is itself visible in the log stream, not just its
			// effect — an operator scanning logs can see diagnostics mode was
			// active, not only infer it from the presence of raw content.
			const auditCall = warnCalls.find(
				(call) =>
					typeof call === 'object' && call !== null && 'diagnosticsUntil' in (call as object),
			);
			expect(auditCall).toBeDefined();
		} finally {
			logger.info = originalInfo;
			logger.warn = originalWarn;
		}
	});
});
