# Skill: New Migration

Create and apply a Drizzle ORM migration.

## Steps

1. Make schema changes in `packages/database/src/schema.ts`
2. Generate migration: `cd packages/database && bunx drizzle-kit generate`
3. Review the generated SQL in `packages/database/drizzle/`
4. Validate: `cd packages/database && bunx drizzle-kit check`
5. Apply: `bun scripts/migrate.ts`

## Important

- The `neon_auth.users_sync` table is managed by Neon Auth — never create migrations for it
- Use `DATABASE_URL_UNPOOLED` for migrations (direct connection, not pooled)
- Always review generated SQL before applying — Drizzle may generate destructive operations
- In CI, `db:validate` runs against a Neon branch (not production)
