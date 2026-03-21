import { describe, it, expect } from 'bun:test';
import { summarizePrompt } from './summarize';
import { createTestContext } from '../testing/context';

describe('summarizePrompt', () => {
	it('has the expected name', () => {
		expect(summarizePrompt.name).toBe('summarize');
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
