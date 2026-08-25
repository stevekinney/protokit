-- Custom SQL migration file, put your code below! --

-- Backfills client_secret_expires_at for confidential clients that were
-- registered before migration 0006 added the column. Without this, every
-- pre-existing confidential client's secret is treated as never-expiring
-- (authenticateOauthClient in applications/web/src/routes/oauth-routes.ts
-- treats NULL as "no expiry recorded", not "expired", so as-registered
-- clients would bypass the 180-day lifetime introduced alongside this
-- column until manually rotated). Grants the same 180-day runway a newly
-- registered client gets, rather than expiring anyone immediately -- see
-- OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS in
-- applications/web/src/lib/credential-lifecycle-policy.ts, which this
-- literal must stay in sync with.
--
-- Public clients (client_secret IS NULL) are untouched -- they have no
-- secret to expire, and authenticateOauthClient's NULL handling continues
-- to apply for any deployment that has not yet applied this migration.
UPDATE "oauth_clients"
SET "client_secret_expires_at" = now() + interval '180 days'
WHERE "client_secret" IS NOT NULL
  AND "client_secret_expires_at" IS NULL;
