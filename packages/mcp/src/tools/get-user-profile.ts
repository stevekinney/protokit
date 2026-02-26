import { z } from 'zod';
import { database, schema } from '@template/database';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

export const getUserProfileTool = {
	name: 'get_user_profile' as const,
	description: "Returns the authenticated user's profile information.",
	inputSchema: z.object({}),
	handler: async (_input: Record<string, never>, context: { userId: string }) => {
		const requestLogger = logger.child({ tool: 'get_user_profile', userId: context.userId });
		const start = Date.now();

		try {
			const [user] = await database
				.select()
				.from(schema.neonAuthUsers)
				.where(eq(schema.neonAuthUsers.id, context.userId))
				.limit(1);

			const durationMs = Date.now() - start;
			requestLogger.info({ durationMs }, 'Tool completed');

			if (!user) {
				return {
					content: [{ type: 'text' as const, text: 'User not found.' }],
					isError: true,
				};
			}

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify({
							id: user.id,
							name: user.name,
							email: user.email,
							image: user.image,
						}),
					},
				],
			};
		} catch (error) {
			const durationMs = Date.now() - start;
			requestLogger.error({ err: error, durationMs }, 'Tool failed');
			return {
				content: [{ type: 'text' as const, text: 'Failed to retrieve user profile.' }],
				isError: true,
			};
		}
	},
};
