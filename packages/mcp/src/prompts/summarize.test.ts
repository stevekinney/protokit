import { describe, it, expect } from 'bun:test';
import { summarizePrompt } from './summarize';
import { createTestContext } from '../testing/context';

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

	it('includes the user ID in the message', async () => {
		const context = createTestContext({ userId: 'custom-user-id' });
		const result = await summarizePrompt.handler({ topic: 'testing' }, context);
		expect(result.messages[0].content.text).toContain('custom-user-id');
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
