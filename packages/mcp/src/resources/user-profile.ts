import { database, schema } from '@template/database';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

export const userProfileResource = {
	name: 'user_profile' as const,
	uri: 'user://profile',
	description: "Exposes the authenticated user's profile information as a JSON resource.",
	mimeType: 'application/json',
	handler: async (uri: URL, context: { userId: string }) => {
		const requestLogger = logger.child({ resource: 'user_profile', userId: context.userId });
		const start = Date.now();

		try {
			const [user] = await database
				.select()
				.from(schema.neonAuthUsers)
				.where(eq(schema.neonAuthUsers.id, context.userId))
				.limit(1);

			const durationMs = Date.now() - start;
			requestLogger.info({ durationMs }, 'Resource read completed');

			if (!user) {
				return {
					contents: [
						{
							uri: uri.href,
							mimeType: 'application/json',
							text: JSON.stringify({ error: 'User not found.' }),
						},
					],
				};
			}

			return {
				contents: [
					{
						uri: uri.href,
						mimeType: 'application/json',
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
			requestLogger.error({ err: error, durationMs }, 'Resource read failed');
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: 'application/json',
						text: JSON.stringify({ error: 'Failed to retrieve user profile.' }),
					},
				],
			};
		}
	},
};
