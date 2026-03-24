import { z } from 'zod';
import { logger } from '../logger.js';
import { createToolJsonResponse, createToolErrorResponse } from '../tool-response.js';
import { findUserById } from '../queries/find-user-by-id.js';

export const getUserProfileTool = {
	name: 'get_user_profile' as const,
	description: "Returns the authenticated user's profile information.",
	inputSchema: z.object({}),
	handler: async (_input: Record<string, never>, context: { userId: string }) => {
		const requestLogger = logger.child({ tool: 'get_user_profile', userId: context.userId });

		try {
			const user = await findUserById(context.userId);

			if (!user) {
				return createToolErrorResponse('User not found.');
			}

			return createToolJsonResponse(user);
		} catch (error) {
			requestLogger.error({ err: error }, 'Tool failed');
			return createToolErrorResponse('Failed to retrieve user profile.');
		}
	},
};
