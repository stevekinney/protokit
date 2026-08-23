# Skill: Environment Variable Validation

Patterns for managing environment variables with `@t3-oss/env-core`. Every package's actual Zod
shape lives in its own `src/environment-schema.ts`; `src/env.ts` is a thin `createEnv({...})`
wrapper around that schema plus the `SKIP_ENV_VALIDATION` rejection below. `doctor` (`scripts/doctor.ts`)
derives its checks from these same schemas — it must never grow a second, hand-maintained variable
list (`DX-001`).

## Per-Package Ownership

Each package owns its environment variables in its own `src/environment-schema.ts` /
`src/env.ts` pair:

| Package             | Representative variables (not exhaustive — read the schema for the full, current list)                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/database` | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DATABASE_LOCAL_PROXY_URL` (local/test only — see `packages/database/CLAUDE.md`)                                                                                                      |
| `packages/mcp`      | `MCP_SERVER_NAME`, `MCP_CONFORMANCE_MODE`, `LOG_LEVEL`, `LOG_CONTENT_DIAGNOSTICS_UNTIL`, `NODE_ENV`                                                                                                                            |
| `applications/web`  | `BASE_URL`, `SESSION_SIGNING_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `REDIS_URL`, `MCP_ALLOWED_ORIGINS`, `MCP_TOKEN_TTL_SECONDS`, every `RATE_LIMIT_*` pair, `TRUSTED_PROXY_*`, `SERVER_BIND_ADDRESS`, `NODE_ENV` |

`NODE_ENV` has no default in either schema — every entry point (`dev`, `test`, `build`, `start`, the
Dockerfile) must set it explicitly, or startup fails rather than silently running as `development`.
Read it in `env.ts` only as `process.env['NODE_ENV']` (the bracket literal), never
`process.env.NODE_ENV` — Bun's bundler constant-folds the dot form at build time and bakes whichever
value was set on the build machine into the shipped bundle, which made `CONFIG-001`'s fail-closed
invariants vacuous in every image ever built until this was fixed. `applications/web/src/build.ts`
asserts the bracket form is still in use so a future edit reverting to the dot form fails the build.

## Adding a New Variable

1. Determine which package owns the variable.
2. Add it to that package's `src/environment-schema.ts` (not `env.ts` directly):
   ```typescript
   MY_NEW_VAR: z.string().min(1),
   ```
3. Wire it through in that package's `src/env.ts`'s `runtimeEnv`:
   ```typescript
   MY_NEW_VAR: process.env.MY_NEW_VAR,
   ```
4. Add it to root `.env.example` with a comment explaining what it does and whether it is required
   in development, test, and production.
5. Add it to `.env.local` for local development.
6. If a deployment target needs it, set it there too (see `RUNBOOK.md` and `SECRETS-ROTATION.md`
   for the Railway/GitHub Actions flow this template ships).
7. Run `bun run doctor` — a new required-in-production variable should be reported with no edit to
   `scripts/doctor.ts` required, because `doctor` reads the schema directly (`DX-001`).

## Rules

- Never read `process.env` directly in application code — always go through that package's `env.ts`.
- Always set `emptyStringAsUndefined: true` on `createEnv({...})`.
- `SKIP_ENV_VALIDATION` does not exist in this codebase (`CONFIG-001`) — every `env.ts` throws
  immediately if it is set, rather than bypassing the schema (including its `.default(...)` values,
  which is exactly what caused a real production-shaped defect, `BUG-001`, documented in
  `PROGRESS.local.md`). Do not reintroduce it under any name.
- This template has no client-exposed environment variables and no `PUBLIC_`-prefixed convention —
  every page is server-rendered with no client-side JavaScript reading configuration. If a future
  change adds one, document the real prefix convention here instead of assuming one.
