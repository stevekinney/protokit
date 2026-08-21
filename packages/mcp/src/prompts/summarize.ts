import { z } from 'zod';
import { logger } from '../logger.js';
import { definePrompt } from '../types/primitives.js';

export const summarizePrompt = definePrompt({
	name: 'summarize',
	title: 'Summarize Topic',
	description:
		'Generates a prompt that asks the assistant to summarize a given topic for the authenticated user.',
	arguments: {
		topic: z.string().describe('The topic to summarize'),
	},
	requiredScope: 'prompts:read',
	handler: async (arguments_, context) => {
		// S-14 (owned by OBS-001, not touched here): this logs raw user-supplied
		// topic content with no redaction policy.
		const requestLogger = logger.child({ prompt: 'summarize', userId: context.userId });

		try {
			requestLogger.info({ topic: arguments_.topic }, 'Prompt requested');

			return {
				messages: [
					{
						role: 'user' as const,
						content: {
							type: 'text' as const,
							text: `Please provide a concise summary of the following topic for user ${context.userId}: ${arguments_.topic}`,
						},
					},
				],
			};
		} catch (error) {
			requestLogger.error({ err: error }, 'Prompt failed');
			return {
				messages: [
					{
						role: 'user' as const,
						content: {
							type: 'text' as const,
							text: 'An error occurred while generating the prompt.',
						},
					},
				],
			};
		}
	},
});
