import { z } from 'zod';
import { logger } from '../logger.js';

export const refreshAccountDashboardTool = {
	name: 'refresh_account_dashboard' as const,
	description: 'Refreshes account dashboard data. Only callable from the dashboard app.',
	inputSchema: z.object({
		section: z.enum(['overview', 'security', 'usage']),
	}),
	handler: async (
		input: { section: 'overview' | 'security' | 'usage' },
		context: { userId: string },
	) => {
		const requestLogger = logger.child({
			tool: 'refresh_account_dashboard',
			userId: context.userId,
		});

		const state = {
			userId: context.userId,
			section: input.section,
			generatedAt: new Date().toISOString(),
		};

		requestLogger.info({ section: input.section }, 'Tool completed');

		return {
			content: [
				{
					type: 'text' as const,
					text: JSON.stringify(state),
				},
			],
			structuredContent: state,
		};
	},
};
