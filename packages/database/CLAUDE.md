# @template/database

Drizzle ORM schema, migrations, and shared database client for Neon Postgres.

## Key Files

- `src/schema.ts` — All table definitions. `neonAuthUsers` is a reference-only table in the `neon_auth` schema (not migrated by Drizzle).
- `src/env.ts` — Owns `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
- `src/index.ts` — Exports the `database` instance and `schema`.
- `drizzle.config.ts` — Uses `DATABASE_URL_UNPOOLED` for migrations.

## Commands

- `bun turbo db:generate` — Generate migration files from schema changes
- `bun turbo db:migrate` — Apply migrations to the database
- `bun turbo db:validate` — Validate migrations match the schema

## Conventions

- Define Zod schemas manually alongside Drizzle schema (never install `drizzle-zod`).
- Foreign keys reference `neonAuthUsers.id` directly — no separate users table.
- JSON array columns use `jsonb().$type<string[]>()`.
