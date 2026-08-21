# Credential rotation and revocation

SECRETS-001 (S-12). One procedure per credential class this template issues or depends on.
"Rotate" means issue a new credential and stop accepting the old one; "revoke" means stop
accepting a credential with no replacement. Every value here still follows the standing rule:
never print, log, or commit a secret. Tooling that writes a fresh secret always writes it
straight to a `0600` file or a secret store, never to stdout.

## Session-signing secret (`SESSION_SIGNING_SECRET`)

Signs session cookies and derives CSRF tokens
(`applications/web/src/lib/session-signing-secret.ts`, `csrf-protection.ts`). There is no
dual-secret verification window in this codebase — rotating this value invalidates every
existing session and CSRF token immediately, the moment the new value is loaded.

Rotate with `bun scripts/rotate-secret.ts session`. It generates a new 32-byte hex secret,
writes it to `.env.local` (mode `0600`, old value never printed), and — if `gh` is installed and
`SESSION_SIGNING_SECRET` is one of the GitHub-managed secrets — pushes the same value to the
GitHub secret store. Restart every running instance afterward; until you do, instances signing
with the old value and instances signing with the new value will reject each other's sessions
inconsistently. Because there is no grace period, treat this as a planned maintenance action:
every signed-in user is signed out the moment the new secret takes effect.

`scripts/rotate-secret.test.ts` proves the invalidation property directly: a value signed with
the pre-rotation secret does not verify against the post-rotation secret, using the exact HMAC
construction `csrf-protection.ts` documents.

## OAuth client credentials (`oauth_clients` table)

A client secret is stored only as a SHA-256 hash (`scripts/seed.ts`'s `hashCredential`); the
plaintext exists nowhere in the database. Rotate with `rotateOauthClientSecret` from
`scripts/rotate-secret.ts` (a library function, not yet wired to a CLI subcommand — call it from
a one-off `bun -e` invocation or extend the CLI before using it against a real client): it
generates a new secret, stores its hash, and returns the plaintext once for out-of-band delivery
to the client owner. As with the session secret, there is no dual-secret window — the moment the
row updates, `/oauth/token`'s `client_secret_post` comparison stops accepting the old value.
Coordinate the handoff with the client owner before rotating, not after.

`scripts/rotate-secret.integration.test.ts` proves this against the real test database: the
pre-rotation secret's hash no longer matches the stored row after rotation, and the new secret's
hash does.

Revoke without replacement by deleting the client row (or setting a `revoked_at`-style flag if
one is added later — none exists today) — every outstanding access and refresh token issued to
that client stops being reissuable once the row is gone, though already-issued unexpired access
tokens remain valid until `OAUTH-003` lands atomic, client-bound revocation.

## Metrics credential (`METRICS_API_KEY`)

Gates `/metrics` (`applications/web/src/routes/metrics-routes.ts`). Rotate by generating a new
random value (`openssl rand -hex 32` or `bun scripts/rotate-secret.ts session`'s generator
pattern), setting it in the scraper/monitoring system's configuration, updating
`METRICS_API_KEY` in the server's environment, and redeploying. There is a brief window where the
scraper's old credential is rejected until its own configuration is updated — acceptable because
metrics scraping tolerates a short gap, unlike session invalidation. Compared in constant time
(`applications/web/src/lib/bearer-credential-authentication.ts`); requires HTTPS in production.

## Readiness credential (`HEALTH_READINESS_API_KEY`)

Gates the dependency-detail readiness probe, `GET /health/ready`
(`applications/web/src/routes/health-routes.ts`) — `OPS-002`'s split from the public,
dependency-free `GET /health` liveness endpoint. Rotate the same way as `METRICS_API_KEY`:
generate a new random value, update whichever orchestrator or operator tooling calls the
endpoint, set `HEALTH_READINESS_API_KEY` in the server's environment, and redeploy. Same brief,
acceptable gap as the metrics credential; compared in constant time; requires HTTPS in
production.

## Database credentials (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`)

Neon supports creating a second role/password without deleting the first, so this is the one
credential class in this list that _can_ roll out without an outage. Create a new Neon role via
`neonctl roles create --project-id <id> --branch <branch> <name>` (or the Neon console), update
`DATABASE_URL`/`DATABASE_URL_UNPOOLED` in `.env.local` and every deployment target (GitHub
Actions secrets via `bun scripts/setup.ts github`, Railway via `bun scripts/setup.ts railway`,
or `bun scripts/rotate-secret.ts revoke-github DATABASE_URL` followed by re-running the GitHub
phase), redeploy, confirm the new role is in use (`doctor` or the authenticated
`GET /health/ready` — `OPS-002` moved dependency status off the public `/health` liveness
endpoint), then revoke the old
role with `neonctl roles delete`. Never delete the old role before every consumer has picked up
the new connection string — deleting it first is an outage, not a rotation.

## Redis credentials (`REDIS_URL`)

Follow the hosting provider's credential-rotation flow (most managed Redis providers, including
Railway's, support issuing a new password without deleting the old one for a transition window).
Update `REDIS_URL` in `.env.local` and every deployment target the same way as the database
credential above, redeploy, confirm connectivity (`doctor`), then revoke the old credential at
the provider. Rotating Redis credentials does not invalidate rate-limit state or sessions —
those are keyed by application-level values, not by the connection credential itself.

## Provider secrets (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)

Rotate in the Google Cloud Console (APIs & Services → Credentials → the OAuth 2.0 Client): create
a new client secret for the existing client ID (Google supports multiple active secrets per
client during a transition window — this is the standard supported rotation path, not a
workaround), update `GOOGLE_CLIENT_SECRET` in `.env.local` and every deployment target, redeploy,
confirm sign-in works, then delete the old secret from the console. Rotating the client ID itself
requires a new OAuth client and a redirect-URI update in Google Cloud Console before cutover, so
treat that as a migration, not a routine rotation.

## CI credentials (GitHub Actions secrets: `NEON_API_KEY`, `NEON_PROJECT_ID`, and the

`DATABASE_URL`/`DATABASE_URL_UNPOOLED`/`SESSION_SIGNING_SECRET` mirrors of the values above)

`scripts/utilities.ts`'s `MANAGED_GITHUB_SECRETS` is the authoritative list. Set or rotate any of
them with `bun scripts/setup.ts github` (re-run; it overwrites existing secrets) or a targeted
`setGithubSecret` call; the value is always delivered over stdin to `gh secret set`, never as an
argv element. Revoke with `bun scripts/teardown.ts github`, which lists every managed secret
present in the repository and deletes it only after explicit confirmation. Because these secrets
back CI workflows rather than a running server, there is no session-invalidation concern —
rotating them takes effect on the next workflow run.

## What this procedure does not cover

Client-bound, atomic revocation of individual outstanding access/refresh tokens without deleting
the whole client is `OAUTH-003`'s scope, not this item's. A scheduled/automatic rotation cadence
(as opposed to an on-demand, manually triggered one) is not implemented for any credential class
above; every rotation here is operator-initiated.
