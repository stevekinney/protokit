import { z } from 'zod';
import { logger } from '../logger.js';
import { environment } from '../env.js';
import { definePrompt } from '../types/primitives.js';

/**
 * OBS-001 / S-14: whether raw prompt content is allowed to be logged right
 * now. `env.ts` already refuses `LOG_CONTENT_DIAGNOSTICS_UNTIL` outright in
 * production, so reaching this point at all means the deployment is
 * dev/test; the timestamp bound still applies there so a diagnostic
 * session does not silently outlive its intended window.
 */
function contentDiagnosticsActive(): boolean {
	const until = environment.LOG_CONTENT_DIAGNOSTICS_UNTIL;
	if (!until) return false;
	return Date.now() < Date.parse(until);
}

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
		// OBS-001 / S-14: user-supplied topic content is pseudonymous by
		// default — only its length is logged, never the text itself. Raw
		// content logging is available only through the explicit,
		// time-bounded `LOG_CONTENT_DIAGNOSTICS_UNTIL` diagnostic mode
		// (`env.ts` refuses it entirely in production), and every request
		// logged under it emits its own audit line so the mode's use is
		// itself visible in the log stream, not just its effect.
		const requestLogger = logger.child({
			prompt: 'summarize',
			userId: context.userId,
			requestId: context.requestId,
		});
		const diagnosticsActive = contentDiagnosticsActive();

		try {
			if (diagnosticsActive) {
				requestLogger.warn(
					{ diagnosticsUntil: environment.LOG_CONTENT_DIAGNOSTICS_UNTIL },
					'Content diagnostics mode active: logging raw prompt topic',
				);
				requestLogger.info({ topic: arguments_.topic }, 'Prompt requested');
			} else {
				requestLogger.info({ topicLength: arguments_.topic.length }, 'Prompt requested');
			}

			return {
				messages: [
					{
						role: 'user' as const,
						content: {
							type: 'text' as const,
							text: `Please provide a concise summary of the following topic: ${arguments_.topic}`,
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
