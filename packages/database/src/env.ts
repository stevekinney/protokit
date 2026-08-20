import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const environment = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
		// Local development and test only — see `local-proxy.ts`. Points the
		// Neon serverless driver's SQL-over-HTTP requests at a local
		// Neon-compatible proxy in front of a plain Postgres container instead
		// of a real Neon project. Must never be set in a deployed environment.
		DATABASE_LOCAL_PROXY_URL: z.string().min(1).optional(),
	},
	runtimeEnv: {
		DATABASE_URL: process.env.DATABASE_URL,
		DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
		DATABASE_LOCAL_PROXY_URL: process.env.DATABASE_LOCAL_PROXY_URL,
	},
	emptyStringAsUndefined: true,
	skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
