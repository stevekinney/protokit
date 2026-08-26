# Skill: Environment Variable Validation

Patterns for managing environment variables with `@lostgradient/environmentalist`. Every package's
actual Zod shape lives in its own `src/environment-schema.ts`; `src/env.ts` is a thin
`environmentalist.sync({...})` wrapper around that schema plus the `SKIP_ENV_VALIDATION` rejection
below. `doctor` (`scripts/doctor.ts`) derives its checks from these same schemas — it must never
grow a second, hand-maintained variable list (`DX-001`).

Environmentalist resolves each schema key from a `SCREAMING_SNAKE_CASE` schema property (e.g.
`BASE_URL`) to a `camelCase` canonical key on the returned object (`environment.baseUrl`) — every
`env.ts` in this repository writes its schema fields in `SCREAMING_SNAKE_CASE` for exactly this
reason. `env.ts` calls `environmentalist.sync(...)` with `exclude` set to drop every source except
the real environment and schema defaults (no CLI flags, `.env` cascade, project config files, or
home-directory dotfiles) — these are server processes, not CLIs, and several of those sources
execute code, which is not a trust boundary to open at boot.

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
Never read `process.env.NODE_ENV`/`process.env['NODE_ENV']` directly, in `env.ts` or anywhere else —
Bun's bundler constant-folds a static member access at build time and bakes whichever value was set
on the build machine into the shipped bundle, which made `CONFIG-001`'s fail-closed invariants
vacuous in every image ever built until this was fixed. Resolving `NODE_ENV` through
`environmentalist.sync(...)`'s dynamic `Object.entries(process.env)` enumeration is what keeps that
read alive at runtime instead — there is no schema field name for the bundler to fold.
`applications/web/src/build.ts` asserts this both ways: the built bundle must contain a dynamic
`process.env` enumeration, and must contain no static `process.env.NODE_ENV`/`process.env["NODE_ENV"]`
access anywhere, so a future regression in any package's `env.ts` fails the build.

## Adding a New Variable

1. Determine which package owns the variable.
2. Add it to that package's `src/environment-schema.ts` (not `env.ts` directly), in
   `SCREAMING_SNAKE_CASE` — that is what derives the env-var name Environmentalist looks up:
   ```typescript
   MY_NEW_VAR: z.string().min(1),
   ```
3. Nothing else to wire up in `env.ts` — `environmentalist.sync({ schema, env, exclude })` derives
   `MY_NEW_VAR` from the schema automatically and exposes it as `environment.myNewVar`.
4. Add it to root `.env.example` with a comment explaining what it does and whether it is required
   in development, test, and production.
5. Add it to `.env.local` for local development.
6. If a deployment target needs it, set it there too (see `RUNBOOK.md` and `SECRETS-ROTATION.md`
   for the Railway/GitHub Actions flow this template ships).
7. Add it to `turbo.json`'s top-level `globalEnv` array — `bun run audit:turbo-env` (`scripts/audit-turbo-env.ts`)
   fails the build otherwise, deriving the expected set from every package's `environment-schema.ts`
   the same way `doctor` does.
8. Run `bun run doctor` — a new required-in-production variable should be reported with no edit to
   `scripts/doctor.ts` required, because `doctor` reads the schema directly (`DX-001`).

## Rules

- Never read `process.env` directly in application code — always go through that package's `env.ts`.
- Environmentalist's canonical key model flips every schema field to a `camelCase` property on the
  returned object (`BASE_URL` in the schema → `environment.baseUrl`). Consumers only ever see the
  camelCase form; never write `environment.BASE_URL`.
- A variable an `env.ts` derives from a real OS variable under a _different_ name (see
  `applications/web/src/env.ts`'s `RAILWAY_REPLICA_IDENTIFIER`/`HOSTNAME_IDENTIFIER` construction)
  is not itself something Environmentalist can discover from the schema alone — list its real,
  underlying OS variable name(s) in `scripts/audit-turbo-env.ts`'s `EXTRA_RUNTIME_ENV_VAR_NAMES`,
  and add the synthetic schema-only key to `DERIVED_ONLY_SCHEMA_KEYS` so the audit doesn't
  incorrectly demand a `turbo.json` entry for a name nothing ever sets directly.
- Environmentalist has no `emptyStringAsUndefined` equivalent — every `env.ts` strips empty-string
  entries from `process.env` by hand before handing them to the resolver, so an unset-but-present
  variable still falls through to the schema's `.default(...)` instead of coercing to `0`/`''`.
  Keep that filter; do not remove it.
- `SKIP_ENV_VALIDATION` does not exist in this codebase (`CONFIG-001`) — every `env.ts` throws
  immediately if it is set, rather than bypassing the schema (including its `.default(...)` values,
  which is exactly what caused a real production-shaped defect, `BUG-001`, documented in
  `PROGRESS.local.md`). Do not reintroduce it under any name.
- This template has no client-exposed environment variables and no `PUBLIC_`-prefixed convention —
  every page is server-rendered with no client-side JavaScript reading configuration. If a future
  change adds one, document the real prefix convention here instead of assuming one.
