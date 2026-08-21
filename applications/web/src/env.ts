import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

// CONFIG-001 / BUG-001: `SKIP_ENV_VALIDATION=true` used to make `@t3-oss/env-core`
// bypass the whole Zod schema, including every `.default(...)` value — that is
// exactly what produced BUG-001's `NaN`-into-Redis defect. The escape hatch is
// removed outright rather than merely gated on `NODE_ENV`: setting the variable
// now fails loudly instead of being silently ignored or silently trusted.
if (process.env.SKIP_ENV_VALIDATION) {
	throw new Error(
		'SKIP_ENV_VALIDATION is not supported. Supply a real environment instead — see .env.example.',
	);
}

export const environment = createEnv({
	server: {
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
	},
	runtimeEnv: {
		BASE_URL: process.env.BASE_URL,
		SESSION_SIGNING_SECRET: process.env.SESSION_SIGNING_SECRET,
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
		SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
		SESSION_TIME_TO_LIVE_SECONDS: process.env.SESSION_TIME_TO_LIVE_SECONDS,
		REDIS_URL: process.env.REDIS_URL,
		RATE_LIMIT_REGISTER_MAX: process.env.RATE_LIMIT_REGISTER_MAX,
		RATE_LIMIT_REGISTER_WINDOW_SECONDS: process.env.RATE_LIMIT_REGISTER_WINDOW_SECONDS,
		RATE_LIMIT_TOKEN_MAX: process.env.RATE_LIMIT_TOKEN_MAX,
		RATE_LIMIT_TOKEN_WINDOW_SECONDS: process.env.RATE_LIMIT_TOKEN_WINDOW_SECONDS,
		INSTANCE_IDENTIFIER: process.env.INSTANCE_IDENTIFIER,
		RAILWAY_REPLICA_IDENTIFIER: process.env.RAILWAY_REPLICA_ID ?? process.env.RAILWAY_INSTANCE_ID,
		HOSTNAME_IDENTIFIER: process.env.HOSTNAME,
		MCP_ALLOWED_ORIGINS: process.env.MCP_ALLOWED_ORIGINS,
		MCP_ENABLE_UI_EXTENSION: process.env.MCP_ENABLE_UI_EXTENSION,
		MCP_CONFORMANCE_MODE: process.env.MCP_CONFORMANCE_MODE,
		MCP_TOKEN_TTL_SECONDS: process.env.MCP_TOKEN_TTL_SECONDS,
		MCP_REFRESH_TOKEN_TTL_SECONDS: process.env.MCP_REFRESH_TOKEN_TTL_SECONDS,
		RATE_LIMIT_MCP_MAX: process.env.RATE_LIMIT_MCP_MAX,
		RATE_LIMIT_MCP_WINDOW_SECONDS: process.env.RATE_LIMIT_MCP_WINDOW_SECONDS,
		RATE_LIMIT_MCP_CONCURRENT_MAX: process.env.RATE_LIMIT_MCP_CONCURRENT_MAX,
		RATE_LIMIT_AUTHORIZE_MAX: process.env.RATE_LIMIT_AUTHORIZE_MAX,
		RATE_LIMIT_AUTHORIZE_WINDOW_SECONDS: process.env.RATE_LIMIT_AUTHORIZE_WINDOW_SECONDS,
		RATE_LIMIT_GOOGLE_AUTH_MAX: process.env.RATE_LIMIT_GOOGLE_AUTH_MAX,
		RATE_LIMIT_GOOGLE_AUTH_WINDOW_SECONDS: process.env.RATE_LIMIT_GOOGLE_AUTH_WINDOW_SECONDS,
		RATE_LIMIT_REVOKE_MAX: process.env.RATE_LIMIT_REVOKE_MAX,
		RATE_LIMIT_REVOKE_WINDOW_SECONDS: process.env.RATE_LIMIT_REVOKE_WINDOW_SECONDS,
		RATE_LIMIT_HEALTH_MAX: process.env.RATE_LIMIT_HEALTH_MAX,
		RATE_LIMIT_HEALTH_WINDOW_SECONDS: process.env.RATE_LIMIT_HEALTH_WINDOW_SECONDS,
		RATE_LIMIT_FAILED_AUTH_MAX: process.env.RATE_LIMIT_FAILED_AUTH_MAX,
		RATE_LIMIT_FAILED_AUTH_WINDOW_SECONDS: process.env.RATE_LIMIT_FAILED_AUTH_WINDOW_SECONDS,
		RATE_LIMIT_SESSION_MAX: process.env.RATE_LIMIT_SESSION_MAX,
		RATE_LIMIT_SESSION_WINDOW_SECONDS: process.env.RATE_LIMIT_SESSION_WINDOW_SECONDS,
		TRUSTED_PROXY_CIDRS: process.env.TRUSTED_PROXY_CIDRS,
		TRUSTED_PROXY_HEADER: process.env.TRUSTED_PROXY_HEADER as
			'x-forwarded-for' | 'forwarded' | 'cf-connecting-ip' | undefined,
		TRUSTED_PROXY_HOP_COUNT: process.env.TRUSTED_PROXY_HOP_COUNT,
		METRICS_API_KEY: process.env.METRICS_API_KEY,
		PORT: process.env.PORT,
		NODE_ENV: process.env.NODE_ENV as 'development' | 'production' | 'test' | undefined,
		PROTOKIT_TUNNEL_ACTIVE: process.env.PROTOKIT_TUNNEL_ACTIVE,
	},
	emptyStringAsUndefined: true,
});
