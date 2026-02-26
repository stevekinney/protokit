import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const environment = createEnv({
	server: {
		MCP_TOKEN_TTL_SECONDS: z.coerce.number().positive().optional().default(3600),
		LOG_LEVEL: z
			.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
			.optional()
			.default('info'),
		NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
	},
	runtimeEnv: {
		MCP_TOKEN_TTL_SECONDS: process.env.MCP_TOKEN_TTL_SECONDS,
		LOG_LEVEL: process.env.LOG_LEVEL,
		NODE_ENV: process.env.NODE_ENV,
	},
	emptyStringAsUndefined: true,
	skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
