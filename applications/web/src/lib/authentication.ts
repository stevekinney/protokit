import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { database } from '@template/database';
import { environment } from '../env.js';

export const authentication = betterAuth({
	database: drizzleAdapter(database, { provider: 'pg' }),
	socialProviders: {
		google: {
			clientId: environment.GOOGLE_CLIENT_ID,
			clientSecret: environment.GOOGLE_CLIENT_SECRET,
		},
	},
});
