import { describe, expect, it, mock } from 'bun:test';
import type { DestinationStream } from 'pino';

/**
 * OBS-001 / S-14: the explicit, time-bounded diagnostic mode. A separate
 * file (not added to `summarize.test.ts`) because it needs `../env.js`
 * mocked before `summarize.ts` is imported — matching this codebase's
 * established `mock.module(...)` + top-level dynamic `import(...)` pattern
 * (see `applications/web/src/lib/mcp-handler.test.ts`).
 *
 * Round 10 review finding: the previous version of this file intercepted
 * `logger.info`/`logger.warn` themselves and inspected the object passed
 * INTO them, before pino's own serialization and redaction ever ran. That
 * meant the test could pass even though the promised diagnostic content
 * never actually reached a log destination — which is exactly what
 * happened: `logger.ts`'s `topic`/`*.topic` redaction paths are
 * unconditional, so pino replaced the raw topic with `[REDACTED]` before
 * writing it out, and this test never noticed because it never looked at
 * real output. Fixed on two sides: `summarize.ts` now logs the diagnostic
 * value under a distinct `diagnosticTopic` key that carries no redaction
 * path (see its own comment), and this file now builds a REAL logger (via
 * `createLogger`, the same factory `redaction.test.ts` uses) writing to an
 * in-memory destination, and asserts against the actual serialized JSON
 * line — not a pre-serialization method-call interception.
 */
mock.module('../env.js', () => ({
	environment: {
		logContentDiagnosticsUntil: '2099-01-01T00:00:00Z',
	},
}));

class MemoryDestination implements DestinationStream {
	lines: string[] = [];
	write(msg: string): void {
		this.lines.push(msg);
	}
	get output(): string {
		return this.lines.join('');
	}
}

const destination = new MemoryDestination();
const { createLogger } = await import('../logger.js');
const capturingLogger = createLogger({ destination });

mock.module('../logger.js', () => ({ logger: capturingLogger, createLogger }));

const { summarizePrompt } = await import('./summarize.js');
const { createTestContext } = await import('../testing/context.js');

describe('summarizePrompt logging (OBS-001, diagnostics active)', () => {
	it('logs the raw topic in the actual serialized output, and an audit line, when the diagnostic window has not expired', async () => {
		const context = createTestContext();
		await summarizePrompt.handler({ topic: 'diagnostics-mode-topic-canary' }, context);

		const output = destination.output;

		// The genuine proof this round-10 finding demands: the raw topic
		// must survive pino's real redaction pipeline and land in the
		// destination, not merely have been passed to `logger.info` before
		// serialization.
		expect(output).toContain('diagnostics-mode-topic-canary');

		// The mode's use is itself visible in the log stream, not just its
		// effect — an operator scanning logs can see diagnostics mode was
		// active, not only infer it from the presence of raw content.
		expect(output).toContain('diagnosticsUntil');
	});

	it('never logs the diagnostic value under the always-redacted "topic" key', async () => {
		const context = createTestContext();
		await summarizePrompt.handler({ topic: 'must-not-appear-under-topic-key' }, context);

		// Defense in depth: confirms the diagnostic branch uses a key
		// (`diagnosticTopic`) distinct from the unconditionally-redacted
		// `topic`/`*.topic` paths, rather than having regressed back onto
		// the always-redacted key.
		expect(destination.output).not.toContain('"topic":"must-not-appear-under-topic-key"');
	});
});
