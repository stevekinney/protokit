import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { database, schema } from '@template/database';
import { environment } from '../env.js';

// Lazy singleton. betterAuth() validates its secret eagerly, which throws
// during SSR builds when env vars aren't available. Deferring initialization
// to the first request means the secret is only read at runtime, where
// env.ts guarantees it exists.
let instance: ReturnType<typeof betterAuth> | undefined;

export function getAuthentication(): ReturnType<typeof betterAuth> {
	if (!instance) {
		instance = betterAuth({
			secret: environment.BETTER_AUTH_SECRET,
			database: drizzleAdapter(database, {
				provider: 'pg',
				schema: {
					user: schema.neonAuthUsers,
					session: schema.neonAuthSessions,
					account: schema.neonAuthAccounts,
					verification: schema.neonAuthVerifications,
				},
			}),
			advanced: {
				database: {
					generateId: 'uuid',
				},
			},
			socialProviders: {
				google: {
					clientId: environment.GOOGLE_CLIENT_ID,
					clientSecret: environment.GOOGLE_CLIENT_SECRET,
				},
			},
		});
	}
	return instance;
}
