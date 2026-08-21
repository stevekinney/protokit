import { createEnv } from '@t3-oss/env-core';

import { mcpServerEnvironmentSchema } from './environment-schema.js';

// CONFIG-001 / BUG-001: see applications/web/src/env.ts for the full
// explanation. The escape hatch is removed everywhere, not just gated on
// `NODE_ENV`, so setting it anywhere fails loudly instead of being ignored.
if (process.env.SKIP_ENV_VALIDATION) {
	throw new Error(
		'SKIP_ENV_VALIDATION is not supported. Supply a real environment instead — see .env.example.',
	);
}

export const environment = createEnv({
	server: mcpServerEnvironmentSchema,
	runtimeEnv: {
		MCP_SERVER_NAME: process.env.MCP_SERVER_NAME,
		MCP_CONFORMANCE_MODE: process.env.MCP_CONFORMANCE_MODE,
		LOG_LEVEL: process.env.LOG_LEVEL,
		NODE_ENV: process.env.NODE_ENV,
	},
	emptyStringAsUndefined: true,
});
