import { z } from 'zod';
import { logger } from '../logger.js';

export const summarizePrompt = {
	name: 'summarize' as const,
	description:
		'Generates a prompt that asks the assistant to summarize a given topic for the authenticated user.',
	arguments: {
		topic: z.string().describe('The topic to summarize'),
	},
	handler: async (arguments_: { topic: string }, context: { userId: string }) => {
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
};
