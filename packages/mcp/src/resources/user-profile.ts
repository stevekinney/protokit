import { logger } from '../logger.js';

export const userProfileResource = {
	name: 'user_profile' as const,
	uri: 'user://profile',
	description: "Exposes the authenticated user's profile information as a JSON resource.",
	mimeType: 'application/json',
	handler: async (uri: URL, context: { userId: string }) => {
		const requestLogger = logger.child({ resource: 'user_profile', userId: context.userId });

		try {
			const { database, schema } = await import('@template/database');
			const { eq } = await import('drizzle-orm');

			const [user] = await database
				.select()
				.from(schema.users)
				.where(eq(schema.users.id, context.userId))
				.limit(1);

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
			requestLogger.error({ err: error }, 'Resource read failed');
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
