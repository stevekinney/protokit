import { z } from 'zod';

/**
 * The raw Zod shape backing `packages/mcp`'s environment schema, factored
 * out of `env.ts` so it can be introspected without importing `env.ts`
 * itself — see `applications/web/src/environment-schema.ts` for the full
 * rationale (that file and this one exist for the same reason). This file
 * has no side effects: it never reads `process.env` and never throws.
 */
export const mcpServerEnvironmentSchema = {
	MCP_SERVER_NAME: z.string().min(1).optional().default('template-mcp-server'),
	MCP_CONFORMANCE_MODE: z.coerce.boolean().optional().default(false),
	LOG_LEVEL: z
		.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
		.optional()
		.default('info'),
	// CONFIG-001: no default — see applications/web/src/env.ts for why an
	// implicit `development` fallback is the root cause this item removes.
	NODE_ENV: z.enum(['development', 'production', 'test']),
};
