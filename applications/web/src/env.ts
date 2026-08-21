import { createEnv } from '@t3-oss/env-core';

import { webServerEnvironmentSchema } from '@web/environment-schema';

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
	server: webServerEnvironmentSchema,
	runtimeEnv: {
		BASE_URL: process.env.BASE_URL,
		SESSION_SIGNING_SECRET: process.env.SESSION_SIGNING_SECRET,
		SESSION_SIGNING_SECRET_PREVIOUS: process.env.SESSION_SIGNING_SECRET_PREVIOUS,
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
		RATE_LIMIT_KEY_NAMESPACE: process.env.RATE_LIMIT_KEY_NAMESPACE,
		TRUSTED_PROXY_CIDRS: process.env.TRUSTED_PROXY_CIDRS,
		TRUSTED_PROXY_HEADER: process.env.TRUSTED_PROXY_HEADER as
			'x-forwarded-for' | 'forwarded' | 'cf-connecting-ip' | undefined,
		TRUSTED_PROXY_HOP_COUNT: process.env.TRUSTED_PROXY_HOP_COUNT,
		METRICS_API_KEY: process.env.METRICS_API_KEY,
		RATE_LIMIT_METRICS_MAX: process.env.RATE_LIMIT_METRICS_MAX,
		RATE_LIMIT_METRICS_WINDOW_SECONDS: process.env.RATE_LIMIT_METRICS_WINDOW_SECONDS,
		HEALTH_READINESS_API_KEY: process.env.HEALTH_READINESS_API_KEY,
		HEALTH_READINESS_CACHE_TTL_SECONDS: process.env.HEALTH_READINESS_CACHE_TTL_SECONDS,
		PORT: process.env.PORT,
		SERVER_BIND_ADDRESS: process.env.SERVER_BIND_ADDRESS,
		// Read via a bracket literal, never `process.env.NODE_ENV`. Bun's bundler
		// constant-folds the dot form at BUILD time — it baked "production" into the
		// container image and "development" into a local build — so the shipped
		// artifact could never observe the runtime value and CONFIG-001's fail-closed
		// invariants were unable to fire. `build.ts` asserts this stays true.
		NODE_ENV: process.env['NODE_ENV'] as 'development' | 'production' | 'test' | undefined,
		PROTOKIT_TUNNEL_ACTIVE: process.env.PROTOKIT_TUNNEL_ACTIVE,
		SCHEDULED_CLEANUP_INTERVAL_SECONDS: process.env.SCHEDULED_CLEANUP_INTERVAL_SECONDS,
		NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
	},
	emptyStringAsUndefined: true,
});
