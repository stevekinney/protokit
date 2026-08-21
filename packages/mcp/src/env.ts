import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

// CONFIG-001 / BUG-001: see applications/web/src/env.ts for the full
// explanation. The escape hatch is removed everywhere, not just gated on
// `NODE_ENV`, so setting it anywhere fails loudly instead of being ignored.
if (process.env.SKIP_ENV_VALIDATION) {
	throw new Error(
		'SKIP_ENV_VALIDATION is not supported. Supply a real environment instead — see .env.example.',
	);
}

export const environment = createEnv({
	server: {
		MCP_SERVER_NAME: z.string().min(1).optional().default('template-mcp-server'),
		MCP_CONFORMANCE_MODE: z.coerce.boolean().optional().default(false),
		LOG_LEVEL: z
			.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
			.optional()
			.default('info'),
		// CONFIG-001: no default — see applications/web/src/env.ts for why an
		// implicit `development` fallback is the root cause this item removes.
		NODE_ENV: z.enum(['development', 'production', 'test']),
	},
	runtimeEnv: {
		MCP_SERVER_NAME: process.env.MCP_SERVER_NAME,
		MCP_CONFORMANCE_MODE: process.env.MCP_CONFORMANCE_MODE,
		LOG_LEVEL: process.env.LOG_LEVEL,
		NODE_ENV: process.env.NODE_ENV,
	},
	emptyStringAsUndefined: true,
});
