# Skill: New Migration

Create and apply a Drizzle ORM migration.

## Steps

1. Make schema changes in `packages/database/src/schema.ts`
2. Generate migration: `cd packages/database && bunx drizzle-kit generate`
3. **Verify the generated SQL** in `packages/database/drizzle/` — remove any `CREATE TABLE "neon_auth".*` or `ALTER TABLE "neon_auth".*` statements (see below)
4. Validate: `cd packages/database && bunx drizzle-kit check`
5. Apply: `bun scripts/migrate.ts`

## Why neon_auth leaks into generated migrations

The `schemaFilter: ['public']` setting in `drizzle.config.ts` only affects `push`, `pull`, and `introspect` commands. `drizzle-kit generate` works from the local schema file, not from the database, so it sees the `neon_auth` reference tables defined in `schema.ts` and emits DDL for them.

After every `drizzle-kit generate`, you must:

- Remove any `CREATE TABLE "neon_auth"."..."` statements
- Remove any `ALTER TABLE "neon_auth"."..."` internal foreign key statements
- Keep cross-schema foreign keys from public tables referencing `neon_auth."user"("id")`

## Important

- Four `neon_auth` tables (`neon_auth.user`, `neon_auth.session`, `neon_auth.account`, `neon_auth.verification`) are managed by Neon Auth — never create migrations for them
- Use `DATABASE_URL_UNPOOLED` for migrations (direct connection, not pooled)
- Always review generated SQL before applying — Drizzle may generate destructive operations
- In CI, `db:validate` runs against a Neon branch (not production)
