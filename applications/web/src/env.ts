import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const environment = createEnv({
	server: {
		BETTER_AUTH_URL: z.string().url().optional(),
		BETTER_AUTH_SECRET: z.string().min(32),
		GOOGLE_CLIENT_ID: z.string().min(1),
		GOOGLE_CLIENT_SECRET: z.string().min(1),
	},
	runtimeEnv: {
		BETTER_AUTH_URL: process.env.BETTER_AUTH_URL
			? process.env.BETTER_AUTH_URL
			: process.env.RAILWAY_PUBLIC_DOMAIN
				? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
				: undefined,
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
	},
	emptyStringAsUndefined: true,
	skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
