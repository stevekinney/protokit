import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const environment = createEnv({
	server: {
		NEON_AUTH_URL: z.string().url(),
		GOOGLE_CLIENT_ID: z.string().min(1).optional(),
		GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
	},
	clientPrefix: 'PUBLIC_',
	client: {
		PUBLIC_APP_URL: z.string().url(),
	},
	runtimeEnv: {
		NEON_AUTH_URL: process.env.NEON_AUTH_URL,
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
		PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
	},
	emptyStringAsUndefined: true,
	skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
