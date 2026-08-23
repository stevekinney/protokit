import { z } from 'zod';

/**
 * Review finding (P1, `environment-schema.ts:155`): `server.ts` multiplies
 * `SCHEDULED_CLEANUP_INTERVAL_SECONDS` by 1000 before handing it to
 * `setInterval`. Node/Bun's timer delay is a 32-bit signed integer
 * (`TIMEOUT_MAX` = 2147483647 ms, confirmed directly against Bun: a larger
 * delay logs a `TimeoutOverflowWarning` and silently substitutes 1ms). A
 * configured value above the largest whole-second count that still fits
 * after that multiplication -- `Math.floor(2147483647 / 1000)` -- would
 * therefore not "run rarely"; it would run on almost every tick of the
 * event loop, which is a full production cleanup sweep firing continuously
 * rather than hourly. Exported so both this schema and its test can share
 * one source of truth instead of two copies of the same arithmetic.
 */
export const maxTimerSafeIntervalSeconds = Math.floor(2147483647 / 1000);

/**
 * SEC-002: `z.coerce.boolean()` calls JavaScript's `Boolean(value)` on
 * whatever string `process.env` handed it. Every non-empty string
 * (including the literal string `"false"`, `"0"`, or `"no"`) is truthy in
 * JavaScript, so `z.coerce.boolean()` treats `MCP_CONFORMANCE_MODE=false`
 * as `true` -- the exact opposite of what an operator setting that value
 * almost certainly intends. This matters here specifically because this
 * schema's boolean fields gate security-relevant behavior
 * (`MCP_CONFORMANCE_MODE`/`PROTOKIT_TUNNEL_ACTIVE` both control whether
 * `mcp-routes.ts`'s localhost DNS-rebinding check is active), so a silent
 * mis-coercion here is a silent control bypass, not a cosmetic bug.
 *
 * Accepts only the literal strings `"true"`/`"false"` (case-sensitive, no
 * `"1"`/`"0"`/`"yes"` aliasing to keep the accepted vocabulary small and
 * unambiguous) or an absent value, and fails validation loudly on anything
 * else -- consistent with `CONFIG-001`'s fail-closed philosophy -- rather
 * than silently coercing a typo into either boolean value.
 */
function strictBooleanEnvironmentFlag(defaultValue: boolean) {
	return z
		.enum(['true', 'false'])
		.optional()
		.default(defaultValue ? 'true' : 'false')
		.transform((value) => value === 'true');
}

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
	// DATA-001 / S-18: the outgoing secret during a rotation's overlap window
	// (`scripts/rotate-secret.ts session`). Verification (session cookie
	// HMAC, CSRF token, Google-sign-in state cookie signature) accepts a
	// value signed under either this or `SESSION_SIGNING_SECRET`; new
	// signing always uses `SESSION_SIGNING_SECRET` only. Unset once the
	// rotation's cutover (`session-cutover`) removes it, which rejects the
	// retired key outright.
	SESSION_SIGNING_SECRET_PREVIOUS: z.string().min(32).optional(),
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
	// CONTENT-001: defaults off. `packages/mcp-apps` ships no application
	// today (`src/applications/` does not exist), so advertising the
	// experimental UI-extension capability by default advertised a
	// capability with nothing behind it. Set to `true` only once a real app
	// exists under `packages/mcp-apps/src/applications/`.
	MCP_ENABLE_UI_EXTENSION: strictBooleanEnvironmentFlag(false),
	MCP_CONFORMANCE_MODE: strictBooleanEnvironmentFlag(false),
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
	// Optional prefix for rate-limit Redis keys. Empty in every real deployment;
	// set per process by the test suite so concurrent runs do not share one
	// budget. See `lib/request-rate-limiter.ts`.
	RATE_LIMIT_KEY_NAMESPACE: z.string().optional(),
	TRUSTED_PROXY_CIDRS: z.string().min(1).optional(),
	TRUSTED_PROXY_HEADER: z.enum(['x-forwarded-for', 'forwarded', 'cf-connecting-ip']).optional(),
	TRUSTED_PROXY_HOP_COUNT: z.coerce.number().int().positive().optional().default(1),
	// Round 10 review finding: `.min(1)` let an operator configure a
	// one-character bearer key (`x`) that both environment validation and
	// production startup accepted -- the network rate limit does not make a
	// trivially guessable shared secret adequate against a distributed
	// caller. Raised to a minimum comparable to `SESSION_SIGNING_SECRET`'s
	// entropy-oriented floor, while omission (unset, disabling the route
	// entirely) remains the way to opt out.
	METRICS_API_KEY: z.string().min(32).optional(),
	RATE_LIMIT_METRICS_MAX: z.coerce.number().int().positive().default(30),
	RATE_LIMIT_METRICS_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
	// OPS-002: gates `GET /health/ready`, the authenticated readiness endpoint
	// that carries the dependency-topology detail `GET /health` (public
	// liveness) no longer does. Same shape as `METRICS_API_KEY` — unset
	// disables the route entirely (404) rather than defaulting to open.
	HEALTH_READINESS_API_KEY: z.string().min(32).optional(),
	// OPS-002: how long a readiness response's Postgres/Redis probe result is
	// cached and coalesced before it is re-run, so a burst of authenticated
	// readiness callers cannot multiply real dependency connection work.
	HEALTH_READINESS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().optional().default(2),
	PORT: z.coerce.number().int().positive().optional().default(3000),
	// Which interface to listen on. Left unset, the server binds to loopback
	// outside production so a forgotten NODE_ENV is never reachable from the LAN.
	// Set it explicitly (`0.0.0.0`) to run in a container, where loopback binding
	// makes a published port unreachable. See `lib/resolve-bind-address.ts`.
	SERVER_BIND_ADDRESS: z.string().min(1).optional(),
	// DOCS-001: the contact address the `/support` page and this template's
	// privacy/terms content point users at. Optional so the template runs
	// out of the box, but a real deployment should set it — an unset value
	// renders honest "not yet configured" guidance instead of a fabricated
	// address, which is deliberate: this repository's own documentation
	// audit refuses to ship a placeholder contact as if it were real.
	SUPPORT_CONTACT_EMAIL: z.string().email().optional(),
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
	PROTOKIT_TUNNEL_ACTIVE: strictBooleanEnvironmentFlag(false),
	// OPEN-2: not a variable this application sets — Node/Bun read it
	// directly to disable TLS certificate validation process-wide. Read only
	// so `production-startup-requirements.ts` can detect and refuse it; see
	// its `nodeTlsRejectUnauthorized` doc comment for why this is the one
	// lever that can silently defeat the sslmode=verify-full and rediss://
	// certificate-validation checks.
	NODE_TLS_REJECT_UNAUTHORIZED: z.string().optional(),
	// DATA-001 / S-18: "cleanup exists only as an unscheduled script." How
	// often `lib/scheduled-cleanup.ts`'s bounded sweep runs, in-process, once
	// the server starts (`server.ts`). One hour by default -- frequent enough
	// that expired-row backlog stays small, infrequent enough that it is
	// never the dominant source of database load.
	SCHEDULED_CLEANUP_INTERVAL_SECONDS: z.coerce
		.number()
		.int()
		.positive()
		.max(
			maxTimerSafeIntervalSeconds,
			`SCHEDULED_CLEANUP_INTERVAL_SECONDS must be at most ${maxTimerSafeIntervalSeconds} seconds -- ` +
				"above that, seconds*1000 overflows Node/Bun's 32-bit setInterval delay, which silently " +
				'substitutes a 1ms interval instead of the configured one.',
		)
		.optional()
		.default(3600),
};
