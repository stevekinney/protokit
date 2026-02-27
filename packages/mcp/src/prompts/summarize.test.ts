import { describe, it, expect } from 'bun:test';
import { summarizePrompt } from './summarize';

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
});
