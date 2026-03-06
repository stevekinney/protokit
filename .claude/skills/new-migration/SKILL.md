# Skill: New Migration

Create and apply a Drizzle ORM migration.

## Steps

1. Make schema changes in `packages/database/src/schema.ts`
2. Generate migration: `cd packages/database && bunx drizzle-kit generate`
3. Review the generated SQL in `packages/database/drizzle/`
4. Validate: `cd packages/database && bunx drizzle-kit check`
5. Apply: `bun scripts/migrate.ts`

## Important

- Four `neon_auth` tables (`neon_auth.user`, `neon_auth.session`, `neon_auth.account`, `neon_auth.verification`) are managed by Neon Auth — never create migrations for them
- `schemaFilter: ['public']` in `drizzle.config.ts` prevents `drizzle-kit generate` from emitting `neon_auth` schema tables automatically
- Use `DATABASE_URL_UNPOOLED` for migrations (direct connection, not pooled)
- Always review generated SQL before applying — Drizzle may generate destructive operations
- In CI, `db:validate` runs against a Neon branch (not production)
