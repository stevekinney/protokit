# @template/database

Drizzle ORM schema, migrations, and shared database client for Neon Postgres.

## Key Files

- `src/schema.ts` — Public schema tables for users, sessions, and OAuth
- `src/env.ts` — Owns `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `DATABASE_LOCAL_PROXY_URL`
- `src/local-proxy.ts` — Local development/test-only override that points the Neon driver's
  SQL-over-HTTP requests at a local proxy instead of a real Neon project. A no-op whenever
  `DATABASE_LOCAL_PROXY_URL` is unset, so it never touches production behavior.
- `src/index.ts` — Exports `database`, `schema`, and `applyLocalProxyFetchEndpoint`
- `drizzle.config.ts` — Uses `DATABASE_URL_UNPOOLED` for migrations
- `drizzle/` — Generated SQL migrations; regenerate with `bun turbo db:generate` after any
  `schema.ts` change and commit the output

## Commands

- `bun turbo db:generate` — Generate migration files from schema changes
- `bun turbo db:migrate` — Apply migrations to the database
- `bun turbo db:validate` — Validate migrations match the schema

## Local integration-test database

`packages/database` uses `@neondatabase/serverless` with drizzle's `neon-http` driver, which
speaks Neon's SQL-over-HTTP protocol rather than the Postgres wire protocol — a plain `postgres`
container cannot answer it directly. Local and CI test runs instead put a Neon-compatible HTTP
proxy (vendored at `docker/local-neon-http-proxy`, from
[timowilhelm/local-neon-http-proxy](https://github.com/timowilhelm/local-neon-http-proxy), CC0)
in front of a real Postgres container:

- Bring the stack up: `bun run test:infrastructure:up` (`docker compose -f
docker-compose.test.yml up -d --build --wait`)
- Apply the schema once the stack is healthy: `bun run test:infrastructure:migrate`
- Tear it down: `bun run test:infrastructure:down` (`docker compose -f docker-compose.test.yml
down -v`)

`DATABASE_LOCAL_PROXY_URL` is what activates the override — set it alongside a `DATABASE_URL`
that matches the compose file's Postgres credentials (`applications/web`'s `test` script does
both). Never set `DATABASE_LOCAL_PROXY_URL` outside local development or test; `src/local-proxy.ts`
is a no-op without it, which is what keeps production traffic against real Neon provably
unchanged (`src/local-proxy.test.ts` covers both branches).

## Baselining a database that predates tracked migrations

`drizzle/` was only added to this repository once (see git history — before it existed, anyone who
had already deployed this template had to run `bunx drizzle-kit generate` locally, uncommitted, and
apply it themselves). Drizzle's `neon-http` migrator (`node_modules/drizzle-orm/neon-http/migrator.js`)
does not track which individual migration files have been applied by content hash — it reads only the
single most recent `created_at` timestamp in `drizzle.__drizzle_migrations` and reruns every migration
file whose journal `when` timestamp is newer than that. A database with no rows in that table (true for
any deployment that predates this directory) will therefore attempt every migration from `0000` onward,
including `CREATE TABLE "oauth_clients"` and friends — which fails with `relation already exists` if
those tables are already there from a prior manual setup.

There is no generic, automated fix for this: a deployment old enough to predate `drizzle/` almost
certainly predates schema changes this repository has since made (`serviceAccountUserId` and
`mcp_sessions` existed at various points and no longer do), so its actual table shape will not match
any single migration's `CREATE TABLE` definitions exactly. Baselining requires an operator to compare
their live schema against `drizzle/meta/*_snapshot.json` and judge which migrations their database
already reflects — this is not something a migration file or CI job can safely automate. Before running
`bun scripts/migrate.ts` against such a database for the first time:

1. Confirm the live schema against `drizzle/meta/000N_snapshot.json` snapshots in order, from `0000` up,
   to find the last migration your existing tables already satisfy.
2. Seed the tracking table so the migrator skips everything up to and including that point:
   `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL,
created_at bigint);` then `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
('baseline', <the "when" value of that migration's entry in drizzle/meta/_journal.json>);`
3. Run `bun scripts/migrate.ts` normally — it will apply only migrations newer than the seeded
   timestamp.

A fresh deployment (the common case — no database exists yet, or it was created by this branch's own
`test:infrastructure:migrate`/`scripts/migrate.ts`) needs none of this; the empty-table case is what
`migrate.ts` already handles correctly.

## Conventions

- Define Zod schemas manually alongside Drizzle schema (never install `drizzle-zod`)
- Use app-owned authentication tables (`users`, `user_sessions`, `user_google_accounts`)
- JSON array columns use `jsonb().$type<string[]>()`
