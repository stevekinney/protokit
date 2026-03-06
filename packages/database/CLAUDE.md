# @template/database

Drizzle ORM schema, migrations, and shared database client for Neon Postgres.

## Key Files

- `src/schema.ts` — All table definitions. Four `neon_auth` tables (`neonAuthUsers`, `neonAuthSessions`, `neonAuthAccounts`, `neonAuthVerifications`) are reference-only — not migrated by Drizzle.
- `src/env.ts` — Owns `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
- `src/index.ts` — Exports the `database` instance and `schema`.
- `drizzle.config.ts` — Uses `DATABASE_URL_UNPOOLED` for migrations. `schemaFilter: ['public']` only affects `push`/`pull`/`introspect`, not `generate`.

## Commands

- `bun turbo db:generate` — Generate migration files from schema changes
- `bun turbo db:migrate` — Apply migrations to the database
- `bun turbo db:validate` — Validate migrations match the schema

## Conventions

- Define Zod schemas manually alongside Drizzle schema (never install `drizzle-zod`).
- Foreign keys reference `neonAuthUsers.id` directly — no separate users table.
- JSON array columns use `jsonb().$type<string[]>()`.

## Neon Auth Tables

The four `neon_auth` tables (`user`, `session`, `account`, `verification`) are managed entirely by Neon Auth. They appear in `schema.ts` as reference-only definitions so Drizzle can resolve foreign keys.

`schemaFilter: ['public']` in `drizzle.config.ts` only affects `push`, `pull`, and `introspect`. It does **not** prevent `drizzle-kit generate` from emitting DDL for `neon_auth` tables, because `generate` reads the local schema file, not the database.

After every `drizzle-kit generate`, verify the output SQL and remove:

- `CREATE TABLE "neon_auth"."..."` statements
- `ALTER TABLE "neon_auth"."..."` internal foreign key statements
- Keep cross-schema foreign keys from public tables to `neon_auth."user"("id")`
