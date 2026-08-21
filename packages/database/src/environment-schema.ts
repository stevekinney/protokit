import { z } from 'zod';

/**
 * The raw Zod shape backing `packages/database`'s environment schema,
 * factored out of `env.ts` so it can be introspected without importing
 * `env.ts` itself — see `applications/web/src/environment-schema.ts` for
 * the full rationale (that file and this one exist for the same reason).
 * This file has no side effects: it never reads `process.env` and never
 * throws.
 */
export const databaseServerEnvironmentSchema = {
	DATABASE_URL: z.string().min(1),
	DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
	// Local development and test only — see `local-proxy.ts`. Points the
	// Neon serverless driver's SQL-over-HTTP requests at a local
	// Neon-compatible proxy in front of a plain Postgres container instead
	// of a real Neon project. Must never be set in a deployed environment.
	DATABASE_LOCAL_PROXY_URL: z.string().min(1).optional(),
};
