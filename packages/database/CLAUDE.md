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

## Conventions

- Define Zod schemas manually alongside Drizzle schema (never install `drizzle-zod`)
- Use app-owned authentication tables (`users`, `user_sessions`, `user_google_accounts`)
- JSON array columns use `jsonb().$type<string[]>()`
