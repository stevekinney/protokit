import { describe, expect, it, mock } from 'bun:test';

/**
 * OBS-001 / S-14: `contentDiagnosticsActive()` in `summarize.ts` treats a
 * configured `LOG_CONTENT_DIAGNOSTICS_UNTIL` in the past the same as no
 * configuration at all -- the window has closed, so raw topic logging must
 * not resume just because the environment variable is still set from an
 * earlier diagnostic session. `summarize.test.ts` covers "not configured"
 * and `summarize-diagnostics.test.ts` covers "configured and still open";
 * this file is the third state neither of those exercises. A separate file
 * (rather than a third `describe` in either of those) for the same reason
 * `summarize-diagnostics.test.ts` is already separate: `../env.js` must be
 * mocked before `summarize.ts` is ever imported, and `mock.module` is
 * global for the whole test run, so each distinct environment shape needs
 * its own file to state its own precondition rather than depending on
 * import order against the other two files.
 */
mock.module('../env.js', () => ({
	environment: {
		logContentDiagnosticsUntil: '2000-01-01T00:00:00Z',
	},
}));

const { summarizePrompt } = await import('./summarize.js');
const { createTestContext } = await import('../testing/context.js');

describe('summarizePrompt logging (OBS-001, diagnostics window expired)', () => {
	it('logs topicLength instead of the raw topic once the configured window has passed', async () => {
		const { logger } = await import('../logger.js');
		const infoCalls: unknown[] = [];
		const originalInfo = logger.info.bind(logger);
		logger.info = ((...args: Parameters<typeof logger.info>) => {
			infoCalls.push(args[0]);
			return originalInfo(...args);
		}) as typeof logger.info;

		try {
			const context = createTestContext();
			await summarizePrompt.handler({ topic: 'a topic after the window closed' }, context);

			const promptRequestedCall = infoCalls.find(
				(call) => typeof call === 'object' && call !== null && 'topicLength' in (call as object),
			) as Record<string, unknown> | undefined;
			expect(promptRequestedCall).toBeDefined();
			expect(promptRequestedCall?.topicLength).toBe('a topic after the window closed'.length);
			expect(promptRequestedCall?.topic).toBeUndefined();

			const diagnosticCall = infoCalls.find(
				(call) =>
					typeof call === 'object' && call !== null && 'diagnosticTopic' in (call as object),
			);
			expect(diagnosticCall).toBeUndefined();
		} finally {
			logger.info = originalInfo;
		}
	});
});
