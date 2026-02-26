import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { database } from '@template/database';
import { environment } from '../env.js';

const googleClientId = environment.GOOGLE_CLIENT_ID;
const googleClientSecret = environment.GOOGLE_CLIENT_SECRET;

const socialProviders =
	googleClientId && googleClientSecret
		? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
		: {};

export const authentication = betterAuth({
	database: drizzleAdapter(database, { provider: 'pg' }),
	socialProviders,
});
