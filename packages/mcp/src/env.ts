import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const environment = createEnv({
	server: {
		MCP_SERVER_NAME: z.string().min(1).optional().default('template-mcp-server'),
		MCP_CONFORMANCE_MODE: z.coerce.boolean().optional().default(false),
		LOG_LEVEL: z
			.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
			.optional()
			.default('info'),
		NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
	},
	runtimeEnv: {
		MCP_SERVER_NAME: process.env.MCP_SERVER_NAME,
		MCP_CONFORMANCE_MODE: process.env.MCP_CONFORMANCE_MODE,
		LOG_LEVEL: process.env.LOG_LEVEL,
		NODE_ENV: process.env.NODE_ENV,
	},
	emptyStringAsUndefined: true,
	skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
