---
paths:
  - packages/database/drizzle/**
---

When reviewing or editing migration SQL files:

- Never include `CREATE TABLE "neon_auth".*` statements
- Never include `ALTER TABLE "neon_auth".*` internal foreign key statements
- Do include cross-schema foreign keys from public tables to `neon_auth."user"("id")`
- Never edit files in `drizzle/meta/`
