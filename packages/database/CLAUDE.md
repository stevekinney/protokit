# @template/database

Drizzle ORM schema, migrations, and shared database client for Neon Postgres.

## Key Files

- `src/schema.ts` — Public schema tables for users, sessions, OAuth, and MCP state
- `src/env.ts` — Owns `DATABASE_URL` and `DATABASE_URL_UNPOOLED`
- `src/index.ts` — Exports `database` and `schema`
- `drizzle.config.ts` — Uses `DATABASE_URL_UNPOOLED` for migrations

## Commands

- `bun turbo db:generate` — Generate migration files from schema changes
- `bun turbo db:migrate` — Apply migrations to the database
- `bun turbo db:validate` — Validate migrations match the schema

## Conventions

- Define Zod schemas manually alongside Drizzle schema (never install `drizzle-zod`)
- Use app-owned authentication tables (`users`, `user_sessions`, `user_google_accounts`)
- JSON array columns use `jsonb().$type<string[]>()`
