import { logger } from '../logger.js';

export type UserProfile = {
	id: string;
	name: string | null;
	email: string;
	image: string | null;
};

export async function findUserById(userId: string): Promise<UserProfile | null> {
	const queryLogger = logger.child({ query: 'find_user_by_id', userId });

	try {
		const { database, schema } = await import('@template/database');
		const { eq } = await import('drizzle-orm');

		const [user] = await database
			.select()
			.from(schema.users)
			.where(eq(schema.users.id, userId))
			.limit(1);

		if (!user) {
			return null;
		}

		return {
			id: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
		};
	} catch (error) {
		queryLogger.error({ err: error }, 'Failed to find user by ID');
		throw error;
	}
}
