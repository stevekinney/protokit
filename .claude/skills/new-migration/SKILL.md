# Skill: New Migration

Create a Drizzle ORM migration. This template's `users` table is this application's own — Google
sign-in (`FEDAUTH-001`) writes into it directly via `user_google_accounts`, there is no separate
managed auth schema, and generated SQL never references a `neon_auth` schema. Do not add
neon_auth-specific cleanup steps; if a future generation ever does produce cross-schema DDL, treat
that as a real defect to investigate, not an expected, routine step to filter out.

## Steps

1. Make schema changes in `packages/database/src/schema.ts`.
2. Generate the migration from the repo root: `bun turbo db:generate` (or, from inside
   `packages/database`, `bunx drizzle-kit generate`).
3. Review the generated SQL in `packages/database/drizzle/` before applying it — Drizzle can
   generate destructive operations (a dropped/renamed column reads as drop-then-add unless you
   rename the migration file's operation by hand); confirm it matches your intent.
4. Validate: `bun turbo db:validate` (or `bunx drizzle-kit check` from `packages/database`).
5. **Do not apply the migration yourself in a shared or orchestrated environment** — this repo's
   standing wave convention (see `PROGRESS.local.md`) is that an implementing agent generates a
   migration and stops; a human or the orchestrating process applies it with
   `bun scripts/migrate.ts` (which uses `DATABASE_URL_UNPOOLED`, the direct, non-pooled connection,
   not the pooled `DATABASE_URL`). Outside that convention — solo local development — running
   `bun scripts/migrate.ts` yourself after review is normal.

## Local test infrastructure

`bun run test:infrastructure:migrate` runs the same `scripts/migrate.ts` against the local
Postgres-backed Neon proxy stack (`docker-compose.test.yml`) that the integration test suite uses —
run it after `test:infrastructure:up` and whenever a new migration needs to reach that stack. See
`packages/database/CLAUDE.md` for the full local test-infrastructure workflow.

## Important

- Every foreign key in this schema cascades (`onDelete: 'cascade'`, `DATA-001`) except
  `oauth_clients` itself, which has none — see the "Deletion behavior decided per relationship"
  reasoning in `.roadmap-progress/DATA-001.md` before adding a new foreign key with different
  behavior; `packages/database/src/schema.test.ts` asserts the cascade behavior of every existing
  one via `getTableConfig`.
- In CI, `db:validate` runs against a real Neon branch created for that pull request, not
  production.
