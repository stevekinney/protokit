import { createEnv } from '@t3-oss/env-core';

import { databaseServerEnvironmentSchema } from './environment-schema.js';

// CONFIG-001 / BUG-001: see applications/web/src/env.ts for the full
// explanation. The escape hatch is removed everywhere, not just gated on
// `NODE_ENV`, so setting it anywhere fails loudly instead of being ignored.
if (process.env.SKIP_ENV_VALIDATION) {
	throw new Error(
		'SKIP_ENV_VALIDATION is not supported. Supply a real environment instead — see .env.example.',
	);
}

export const environment = createEnv({
	server: databaseServerEnvironmentSchema,
	runtimeEnv: {
		DATABASE_URL: process.env.DATABASE_URL,
		DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
		DATABASE_LOCAL_PROXY_URL: process.env.DATABASE_LOCAL_PROXY_URL,
	},
	emptyStringAsUndefined: true,
});
