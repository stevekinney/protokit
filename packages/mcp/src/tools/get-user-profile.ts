import { z } from 'zod';
import { logger } from '../logger.js';
import { createToolJsonResponse, createToolErrorResponse } from '../tool-response.js';

export const getUserProfileTool = {
	name: 'get_user_profile' as const,
	description: "Returns the authenticated user's profile information.",
	inputSchema: z.object({}),
	handler: async (_input: Record<string, never>, context: { userId: string }) => {
		const requestLogger = logger.child({ tool: 'get_user_profile', userId: context.userId });

		try {
			const { database, schema } = await import('@template/database');
			const { eq } = await import('drizzle-orm');

			const [user] = await database
				.select()
				.from(schema.users)
				.where(eq(schema.users.id, context.userId))
				.limit(1);

			if (!user) {
				return createToolErrorResponse('User not found.');
			}

			return createToolJsonResponse({
				id: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
			});
		} catch (error) {
			requestLogger.error({ err: error }, 'Tool failed');
			return createToolErrorResponse('Failed to retrieve user profile.');
		}
	},
};
