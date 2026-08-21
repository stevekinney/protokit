import { z } from 'zod';

/**
 * The raw Zod shape backing `applications/web`'s environment schema,
 * factored out of `env.ts` so it can be introspected without importing
 * `env.ts` itself. `env.ts` validates the real `process.env` immediately at
 * module load and throws on an invalid or incomplete environment (by
 * design — see its `SKIP_ENV_VALIDATION` guard); `scripts/doctor.ts` needs
 * to report a missing or invalid variable as a readable failure instead of
 * an uncaught exception, which means it must never trigger that
 * module-load-time validation.
 *
 * This file has no side effects: it never reads `process.env` and never
 * throws. `env.ts` is still the single place a field is added, removed, or
 * tightened — `doctor` (via `@web/environment-schema`) and application
 * startup (via `@web/env`) both read this same object, so neither can drift
 * from the other.
 */
export const webServerEnvironmentSchema = {
	BASE_URL: z.string().url().optional(),
	SESSION_SIGNING_SECRET: z.string().min(32).optional(),
	GOOGLE_CLIENT_ID: z.string().min(1).optional(),
	GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
	SESSION_COOKIE_NAME: z.string().min(1).optional().default('application_session'),
	SESSION_TIME_TO_LIVE_SECONDS: z.coerce.number().int().positive().optional().default(2_592_000),
	REDIS_URL: z.string().url().optional(),
	RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(10),
	RATE_LIMIT_REGISTER_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
	RATE_LIMIT_TOKEN_MAX: z.coerce.number().int().positive().default(30),
	RATE_LIMIT_TOKEN_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
	INSTANCE_IDENTIFIER: z.string().optional(),
	RAILWAY_REPLICA_IDENTIFIER: z.string().optional(),
	HOSTNAME_IDENTIFIER: z.string().optional(),
	MCP_ALLOWED_ORIGINS: z.string().min(1).default('http://localhost:3000'),
	MCP_ENABLE_UI_EXTENSION: z.coerce.boolean().optional().default(true),
	MCP_CONFORMANCE_MODE: z.coerce.boolean().optional().default(false),
	MCP_TOKEN_TTL_SECONDS: z.coerce.number().positive().optional().default(3600),
	MCP_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().positive().optional().default(2592000),
	RATE_LIMIT_MCP_MAX: z.coerce.number().int().positive().default(60),
	RATE_LIMIT_MCP_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
	RATE_LIMIT_MCP_CONCURRENT_MAX: z.coerce.number().int().positive().default(10),
	RATE_LIMIT_AUTHORIZE_MAX: z.coerce.number().int().positive().default(30),
	RATE_LIMIT_AUTHORIZE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
	RATE_LIMIT_GOOGLE_AUTH_MAX: z.coerce.number().int().positive().default(20),
	RATE_LIMIT_GOOGLE_AUTH_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
	RATE_LIMIT_REVOKE_MAX: z.coerce.number().int().positive().default(30),
	RATE_LIMIT_REVOKE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
	RATE_LIMIT_HEALTH_MAX: z.coerce.number().int().positive().default(60),
	RATE_LIMIT_HEALTH_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
	RATE_LIMIT_FAILED_AUTH_MAX: z.coerce.number().int().positive().default(10),
	RATE_LIMIT_FAILED_AUTH_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
	RATE_LIMIT_SESSION_MAX: z.coerce.number().int().positive().default(10),
	RATE_LIMIT_SESSION_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
	TRUSTED_PROXY_CIDRS: z.string().min(1).optional(),
	TRUSTED_PROXY_HEADER: z.enum(['x-forwarded-for', 'forwarded', 'cf-connecting-ip']).optional(),
	TRUSTED_PROXY_HOP_COUNT: z.coerce.number().int().positive().optional().default(1),
	METRICS_API_KEY: z.string().min(1).optional(),
	PORT: z.coerce.number().int().positive().optional().default(3000),
	// Which interface to listen on. Left unset, the server binds to loopback
	// outside production so a forgotten NODE_ENV is never reachable from the LAN.
	// Set it explicitly (`0.0.0.0`) to run in a container, where loopback binding
	// makes a published port unreachable. See `lib/resolve-bind-address.ts`.
	SERVER_BIND_ADDRESS: z.string().min(1).optional(),
	// CONFIG-001 (S-06): no default. A host that forgets to set this must
	// crash rather than silently run as `development` — the mode that
	// leaves `GET /auth/dev/login` reachable. Every legitimate entry point
	// (dev script, test scripts, `start`, the Dockerfile) sets this
	// explicitly; see PROGRESS.local.md / `.roadmap-progress/CONFIG-001.md`.
	NODE_ENV: z.enum(['development', 'production', 'test']),
	// CONFIG-001: set by `scripts/develop.ts` only when it is invoked with
	// `--tunnel`. When true, the development-only login route refuses to
	// issue a session even though `NODE_ENV === 'development'`, because a
	// tunnel makes that route reachable from the public internet.
	PROTOKIT_TUNNEL_ACTIVE: z.coerce.boolean().optional().default(false),
	// OPEN-2: not a variable this application sets — Node/Bun read it
	// directly to disable TLS certificate validation process-wide. Read only
	// so `production-startup-requirements.ts` can detect and refuse it; see
	// its `nodeTlsRejectUnauthorized` doc comment for why this is the one
	// lever that can silently defeat the sslmode=verify-full and rediss://
	// certificate-validation checks.
	NODE_TLS_REJECT_UNAUTHORIZED: z.string().optional(),
};
