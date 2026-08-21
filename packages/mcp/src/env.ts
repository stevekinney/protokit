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
		// Read via a bracket literal, never `process.env.NODE_ENV`. Bun's bundler
		// constant-folds the dot form at BUILD time — it baked "production" into the
		// container image and "development" into a local build — so the shipped
		// artifact could never observe the runtime value and CONFIG-001's fail-closed
		// invariants were unable to fire. `build.ts` asserts this stays true.
		NODE_ENV: process.env['NODE_ENV'],
		LOG_CONTENT_DIAGNOSTICS_UNTIL: process.env.LOG_CONTENT_DIAGNOSTICS_UNTIL,
	},
	emptyStringAsUndefined: true,
});

// OBS-001: the same fail-closed shape as the `SKIP_ENV_VALIDATION` check
// above — a schema `.refine()` cannot see NODE_ENV here (this schema shape
// is shared, side-effect-free, and intentionally has no cross-field
// checks), so this is enforced imperatively, once, right after validation.
// A diagnostic timestamp value is otherwise legitimate in development/test;
// only production refuses it outright, regardless of how far in the future
// it is set.
if (environment.NODE_ENV === 'production' && environment.LOG_CONTENT_DIAGNOSTICS_UNTIL) {
	throw new Error(
		'LOG_CONTENT_DIAGNOSTICS_UNTIL is not supported in production. Raw prompt content logging cannot run in production.',
	);
}
