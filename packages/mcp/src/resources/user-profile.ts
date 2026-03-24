import { logger } from '../logger.js';
import { findUserById } from '../queries/find-user-by-id.js';

export const userProfileResource = {
	name: 'user_profile' as const,
	uri: 'user://profile',
	description: "Exposes the authenticated user's profile information as a JSON resource.",
	mimeType: 'application/json',
	handler: async (uri: URL, context: { userId: string }) => {
		const requestLogger = logger.child({ resource: 'user_profile', userId: context.userId });

		try {
			const user = await findUserById(context.userId);

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
						text: JSON.stringify(user),
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
