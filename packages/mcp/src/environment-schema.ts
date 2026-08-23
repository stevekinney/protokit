import { z } from 'zod';

/**
 * SEC-002: `z.coerce.boolean()` calls JavaScript's `Boolean(value)`, and
 * every non-empty string — including the literal string `"false"` — is
 * truthy. Duplicated from `applications/web/src/environment-schema.ts`
 * rather than imported (this package's `env.ts` must not depend on
 * `applications/web`) — see that file's copy of this comment for the full
 * rationale.
 */
function strictBooleanEnvironmentFlag(defaultValue: boolean) {
	return z
		.enum(['true', 'false'])
		.optional()
		.default(defaultValue ? 'true' : 'false')
		.transform((value) => value === 'true');
}

/**
 * The raw Zod shape backing `packages/mcp`'s environment schema, factored
 * out of `env.ts` so it can be introspected without importing `env.ts`
 * itself — see `applications/web/src/environment-schema.ts` for the full
 * rationale (that file and this one exist for the same reason). This file
 * has no side effects: it never reads `process.env` and never throws.
 */
export const mcpServerEnvironmentSchema = {
	MCP_SERVER_NAME: z.string().min(1).optional().default('template-mcp-server'),
	MCP_CONFORMANCE_MODE: strictBooleanEnvironmentFlag(false),
	LOG_LEVEL: z
		.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
		.optional()
		.default('info'),
	// CONFIG-001: no default — see applications/web/src/env.ts for why an
	// implicit `development` fallback is the root cause this item removes.
	NODE_ENV: z.enum(['development', 'production', 'test']),
	// OBS-001: the explicit, time-bounded escape hatch for logging raw
	// prompt content (e.g. `summarize`'s `topic` argument) instead of the
	// pseudonymous default. An ISO 8601 timestamp, not a boolean — content
	// logging is only active while `Date.now()` is before this value, so a
	// diagnostic session left running does not silently become permanent.
	// `env.ts` additionally refuses to start production with this set at
	// all, regardless of the timestamp, matching CONFIG-001's fail-closed
	// pattern for other environment escape hatches.
	LOG_CONTENT_DIAGNOSTICS_UNTIL: z.iso.datetime({ offset: true }).optional(),
};
