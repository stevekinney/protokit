import { describe, it, expect, mock } from 'bun:test';

/**
 * Declares diagnostics OFF explicitly rather than inheriting whatever the
 * process happens to have.
 *
 * `summarize-diagnostics.test.ts` mocks `../env.js` with
 * `LOG_CONTENT_DIAGNOSTICS_UNTIL` set. Bun's `mock.module` is global and is
 * not restored at file boundaries, so when that file ran first this one saw
 * diagnostics ON and `summarize.ts` logged the raw-topic branch instead of
 * `topicLength` — the assertion below failed with `Received: undefined`. It
 * passed locally and failed in continuous integration purely because the two
 * files ran in a different order.
 *
 * Both files now state their own precondition, so neither depends on the
 * other's ordering. This is the same class of defect as OPEN-5 in
 * PROGRESS.local.md, reintroduced here in `packages/mcp`.
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
		MCP_SERVER_NAME: 'protokit-mcp-server',
		MCP_CONFORMANCE_MODE: false,
		LOG_CONTENT_DIAGNOSTICS_UNTIL: undefined,
	}),
}));

const { summarizePrompt } = await import('./summarize.js');
const { createTestContext } = await import('../testing/context.js');

describe('summarizePrompt', () => {
	it('has the expected name', () => {
		expect(summarizePrompt.name).toBe('summarize');
	});

	it('has a title', () => {
		expect(summarizePrompt.title).toBeTruthy();
	});

	it('has a description', () => {
		expect(summarizePrompt.description).toBeTruthy();
	});

	it('has an arguments schema with a topic field', () => {
		expect(summarizePrompt.arguments).toBeDefined();
		expect(summarizePrompt.arguments.topic).toBeDefined();
	});

	it('has a handler function', () => {
		expect(typeof summarizePrompt.handler).toBe('function');
	});

	it('returns a message containing the topic', async () => {
		const context = createTestContext();
		const result = await summarizePrompt.handler({ topic: 'quantum computing' }, context);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].role).toBe('user');
		expect(result.messages[0].content.text).toContain('quantum computing');
	});

	it('never leaks the user ID into the returned message (AUTHZ-001: userId is profile:read-protected, prompts:read must not expose it)', async () => {
		const context = createTestContext({ userId: 'custom-user-id' });
		const result = await summarizePrompt.handler({ topic: 'testing' }, context);
		expect(result.messages[0].content.text).not.toContain('custom-user-id');
	});
});

/**
 * OBS-001 / S-14: by default (no `LOG_CONTENT_DIAGNOSTICS_UNTIL`
 * configured, the real state of this test run's environment), the raw
 * topic must never reach the logger — only its length.
 */
describe('summarizePrompt logging (OBS-001, diagnostics off)', () => {
	it('logs topicLength instead of the raw topic', async () => {
		const { logger } = await import('../logger.js');
		const infoCalls: unknown[] = [];
		const originalInfo = logger.info.bind(logger);
		logger.info = ((...args: Parameters<typeof logger.info>) => {
			infoCalls.push(args[0]);
			return originalInfo(...args);
		}) as typeof logger.info;

		try {
			const context = createTestContext();
			await summarizePrompt.handler({ topic: 'a secret internal project codename' }, context);

			const promptRequestedCall = infoCalls.find(
				(call) => typeof call === 'object' && call !== null && 'topicLength' in (call as object),
			) as Record<string, unknown> | undefined;
			expect(promptRequestedCall).toBeDefined();
			expect(promptRequestedCall?.topicLength).toBe('a secret internal project codename'.length);
			expect(promptRequestedCall?.topic).toBeUndefined();

			for (const call of infoCalls) {
				const serialized = JSON.stringify(call);
				expect(serialized).not.toContain('a secret internal project codename');
			}
		} finally {
			logger.info = originalInfo;
		}
	});
});
