# First Deployment Runbook

A step-by-step procedure for the first real deployment of this template. It assumes nothing has
been created yet—no Neon project, no Railway service, no Google OAuth client—and walks through
every step in the order a person actually does them, including what "it worked" looks like at each
one.

For reference material this runbook does not repeat, see the "Deployment, Migrations, and
Operations" section of `README.md` (the public deployment envelope, backup/rollback policy, and
the ready-to-run verification harnesses), `RUNBOOK.md` (observability—what gets logged, alert
conditions), `SECRETS-ROTATION.md` (rotating a credential after this runbook is done), and
`packages/database/CLAUDE.md` (the migration baselining procedure—read the note under "Before
you start" below first; it does not apply to a fresh database).

## Before you start

A fresh Neon database—the normal case for a first deployment—needs none of
`packages/database/CLAUDE.md`'s "Baselining a database that predates tracked migrations" section.
That procedure exists only for a database that already had tables in it before this repository
tracked migrations (for example, an earlier fork of this template that was deployed by hand). If
this is a brand-new Neon project, skip that section entirely and go straight to "Run the first
migration" below—`bun scripts/migrate.ts` handles an empty database on its own.

## What must exist before starting

Create these first. All four are the owner's own account-settings steps.

### Neon project

A Postgres database. `bun scripts/setup.ts neon` (see "Run the setup wizard" below) creates one
for you via `neonctl`, or create one by hand in the Neon console. Either way you need:

- A region (default `aws-us-east-2` / Ohio—set with `NEON_REGION` conventions in this
  repository, or pass a different region to the wizard).
- The pooled connection string (`DATABASE_URL`) and the direct/unpooled one
  (`DATABASE_URL_UNPOOLED`)—migrations run against the unpooled URL
  (`packages/database/src/migrate.ts` prefers `DATABASE_URL_UNPOOLED` when it is set).
- The connection string must use `sslmode=verify-full` in production—Neon's own connection
  strings already do this; do not weaken it to `sslmode=require`.
- The Neon project ID (needed later for the `NEON_PROJECT_ID` GitHub secret and the pre-migration
  branch snapshot).

### Railway service

The compute target. `railway.toml` at the repository root already declares how it builds and
runs—`builder = "DOCKERFILE"`, `startCommand = "bun applications/web/dist/server.js"`,
`healthcheckPath = "/health"`—so creating the service itself is the only manual step:

- Create a new Railway project and service pointed at this repository (or run `railway init`
  during the setup wizard's Railway phase).
- Reserve a domain for it (`railway domain`, or attach a custom domain) before running the setup
  wizard's `base-url` phase—Railway does not assign a domain until the first deploy, and the
  wizard needs the URL you intend to serve from up front.
- Note the exact Railway **service name**—you will need it for the `RAILWAY_SERVICE_NAME`
  GitHub Actions variable in the "Environment variables and secrets" section below.

### Redis instance

Any managed Redis provider that supports TLS. Production requires the encrypted `rediss://`
scheme on a non-loopback host—`redis://localhost:6379` (the local development default) fails
production startup outright. Have the `rediss://user:pass@host:port` connection string ready.

### Google OAuth client

Google sign-in is the only authentication provider this template ships (`/auth/dev/login` is
disabled outside development)—production refuses to start without both `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. Create an OAuth 2.0 Client ID in
[Google Cloud Console → APIs & Credentials](https://console.cloud.google.com/apis/credentials) and
register these two redirect URIs—both, not just the production one, since Console requires each
environment's exact URI up front:

```
https://your-app.up.railway.app/auth/google/callback
http://localhost:3000/auth/google/callback
```

That exact path—`/auth/google/callback`, not `/api/auth/callback/google` or any other shape—is
what the router (`applications/web/src/application.tsx`) and the token-exchange code
(`applications/web/src/lib/google-authentication.ts`, both the authorization-request and
code-exchange call sites) actually serve. It is derived from `BASE_URL` at request time
(`${BASE_URL}/auth/google/callback`), so once `BASE_URL` is set correctly the application computes
the right redirect URI on its own—the manual step is only registering that same URI with Google
in advance.

## The two out-of-band prerequisites

Two steps only the owner can do, in the Railway and GitHub dashboards respectively. Neither is
optional, and skipping either one breaks the safety property the production workflow is built
around.

### Disable Railway's own deploy-on-push

`.github/workflows/production.yml` is written on the assumption that it is the _only_ thing that
triggers a deployment: its `deploy` job runs only after `migrate` has succeeded
(`needs: migrate`), under the same protected `production` GitHub environment. If Railway's own
git-integration "deploy on push" is still enabled for this service, Railway's webhook can push a
new revision live independently of this workflow—a commit could reach production without the
migration job ever running, or before it finishes, defeating the entire "migrate before deploy"
ordering this repository is built to guarantee.

Disable it in the Railway dashboard: the service's Settings → Source → disable automatic
deployments from the connected GitHub repository (or disconnect the GitHub source integration
entirely and let `railway up` in the `deploy` job be the only path to a new revision). This is a
one-time setting.

### Create the protected `production` GitHub environment

`production.yml` declares `environment: production` on both the `migrate` and `deploy` jobs, but
that declaration by itself gates nothing—it is inert until a GitHub _environment_ named
`production` actually exists with protection rules attached. Without it, both jobs run
unconditionally on every push to `main`.

Create it in the repository's Settings → Environments → New environment, name it exactly
`production`, and attach at least one of:

- Required reviewers (someone must approve before the job runs), or
- A deployment branch policy restricted to `main` (or a protected branch pattern),

Also add the environment's own secrets and variables here if you prefer per-environment secrets
over repository-wide ones (see the next section—either scope works, since `production.yml`
references `secrets.*`/`vars.*`, which GitHub Actions resolves against the environment first).

## Environment variables and GitHub secrets

Two separate sets: what the _application_ reads at startup (`applications/web/src/env.ts`,
`packages/database/src/env.ts`), and what the _`production.yml` workflow_ reads to run migrations
and deploy. The table below is read directly from
`applications/web/src/environment-schema.ts`, `packages/database/src/environment-schema.ts`, and
the `secrets.`/`vars.` references in `.github/workflows/production.yml`—not from memory.

### What `production.yml` needs (GitHub secrets and variables)

| Name                    | Kind                                   | Required | Used by                                                                                           | Source                            |
| ----------------------- | -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| `NEON_PROJECT_ID`       | secret                                 | yes      | `migrate` job—the pre-migration Neon branch snapshot                                              | Neon project settings             |
| `NEON_API_KEY`          | secret                                 | yes      | `migrate` job—same snapshot step; without it the migration job fails before running any migration | Neon account → API keys           |
| `DATABASE_URL`          | secret                                 | yes      | `migrate` job—passed to `bun scripts/migrate.ts`                                                  | Neon connection string (pooled)   |
| `DATABASE_URL_UNPOOLED` | secret                                 | yes      | `migrate` job—preferred by `runMigrations` when set                                               | Neon connection string (direct)   |
| `RAILWAY_TOKEN`         | secret                                 | yes      | `deploy` job—the only credential it uses to authenticate with Railway                             | Railway account → tokens          |
| `RAILWAY_SERVICE_NAME`  | **variable** (`vars.`, not `secrets.`) | yes      | `deploy` job—`railway up --service "..."`                                                         | Railway service name, set by hand |

`RAILWAY_SERVICE_NAME` is a repository or environment _variable_, not a secret—set it with
`gh variable set RAILWAY_SERVICE_NAME --body "<your-service-name>"` (repository-wide) or through
the `production` environment's own Variables tab. Note that `bun scripts/setup.ts github` does
**not** set this one—it only manages the six secrets in `MANAGED_GITHUB_SECRETS`
(`scripts/utilities.ts`), so this variable has to be set by hand regardless of whether you run the
wizard.

Never echo, print, or paste any of the four secret values above into a terminal command line,
a commit, or a log—supply them through `gh secret set <NAME>` (reads from stdin/prompt) or the
GitHub UI.

### What the application needs at startup (production)

Every field below comes from `applications/web/src/environment-schema.ts` and
`packages/database/src/environment-schema.ts`. "Required in production" reflects
`collectProductionStartupFailures` (`applications/web/src/lib/production-startup-requirements.ts`)
— the same fail-closed check `scripts/doctor.ts --production` runs and the real server enforces at
boot.

Required, no default, production refuses to start without it:

- `NODE_ENV=production`—no schema default; every entry point must set it explicitly. The
  Dockerfile already bakes `ENV NODE_ENV=production`, so this is normally already correct once
  you deploy the container image, but `scripts/setup.ts`'s Railway phase pushes it explicitly too.
- `DATABASE_URL`—`sslmode=verify-full`, no loopback host, no placeholder credentials.
- `BASE_URL`—one canonical `https://` origin only (scheme + host + optional port, no path,
  query, fragment, or embedded credentials). OAuth issuer identity and MCP resource metadata are
  both derived from this value directly.
- `REDIS_URL`—must use `rediss://`, a non-loopback host, and no placeholder credentials (the
  local development default `redis://localhost:6379` fails every one of these checks).
- `SESSION_SIGNING_SECRET`—at least 32 characters; generate with `openssl rand -hex 32`.
  Production refuses to auto-generate a fallback the way development does.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`—both required together; there is no other
  sign-in provider in production.
- `TRUSTED_PROXY_CIDRS` and `TRUSTED_PROXY_HEADER`—both required together. Production runs
  behind Railway's reverse proxy; without both, rate limiting and failed-authentication lockouts
  fall back to the proxy's own socket address for every request, collapsing every real client onto
  one shared bucket. `TRUSTED_PROXY_HEADER` must be one of `x-forwarded-for`, `forwarded`, or
  `cf-connecting-ip`; find Railway's current published proxy CIDR ranges in Railway's own
  documentation before entering them.

Optional, but must be absent or correctly shaped when present:

- `DATABASE_URL_UNPOOLED`—optional; when set, must also be `sslmode=verify-full`.
- `DATABASE_LOCAL_PROXY_URL`—must be **unset** in production; startup refuses to run if it is
  present at all. Local development and test only.
- `NODE_TLS_REJECT_UNAUTHORIZED`—must not be `"0"`; that disables TLS certificate validation
  process-wide (Postgres and Redis connections included), silently defeating every check above.
- `MCP_CONFORMANCE_MODE`—must not be `true` in production; it registers a synthetic
  conformance-fixture registry outside the production scope checks.
- `TRUSTED_PROXY_HOP_COUNT`—a positive integer when set; defaults to `1`.
- `MCP_ALLOWED_ORIGINS`—every entry must canonicalize to a real browser `Origin`
  (`scheme://host[:port]`, nothing else); default `http://localhost:3000` should be replaced with
  your real deployed origin(s).
- `SUPPORT_CONTACT_EMAIL`, `METRICS_API_KEY`, `HEALTH_READINESS_API_KEY`—optional but
  recommended for a real deployment: the support/legal pages render "not yet configured" honestly
  when unset, and `/metrics`/`/health/ready` stay 404 (disabled) without a key rather than
  defaulting open.
- Rate-limit tuning (`RATE_LIMIT_*_MAX`/`RATE_LIMIT_*_WINDOW_SECONDS`) and MCP token TTLs
  (`MCP_TOKEN_TTL_SECONDS`, `MCP_REFRESH_TOKEN_TTL_SECONDS`)—all have sane defaults; see
  `.env.example` for the full list. None of these block startup.

None of the values above should ever be echoed, printed, or committed. `scripts/setup.ts` writes
them to the git-ignored `.env.local` for local development and pushes the Railway copies via
`railway variable set <KEY> --stdin` (value delivered over stdin, never as an argv element visible
in `ps` output).

## The setup wizard and doctor

`bun scripts/setup.ts` runs the full first-time configuration flow end to end: environment mode,
Neon project creation, session secret generation, Google OAuth prompt, Redis, MCP protocol
defaults, `BASE_URL`, trusted-proxy configuration, Railway variable push, GitHub secrets, and the
first migration—in that order, each phase gated on the one before it where a later phase depends
on an earlier one's output (for example, the Railway phase refuses to run until `BASE_URL` and the
trusted-proxy pair are both valid). Each phase is also runnable individually:
`bun scripts/setup.ts <phase>` (`environment`, `neon`, `google`, `session`, `redis`, `mcp`,
`base-url`, `trusted-proxy`, `railway`, `github`, `migration`).

Before running it, install the CLIs it needs: `neonctl` (`npm install -g neonctl`), `railway`
(`npm install -g @railway/cli`), and `gh` (https://cli.github.com/), then authenticate each
(`neonctl auth`, `railway login`, `gh auth login`).

Run `bun run doctor` at any point (and again after each major step below)—it validates every
package's environment schema against `.env.local` merged with the real process environment, runs
the same production-readiness collector the real server enforces (when invoked with
`--production`), probes the database and Redis connections directly, and reports GitHub
authentication, configured secrets (against the same `MANAGED_GITHUB_SECRETS` list `setup.ts`
manages), and whether Railway is linked. It exits non-zero on any failure and prints one line per
issue with the specific field and constraint that failed—this is the fastest way to find out
what's still missing before pushing to `main`.

Confirmed directly: `bun run doctor` with no `.env.local` and no environment configured runs
cleanly and reports 3 failures / 8 warnings (missing `DATABASE_URL`, missing `NODE_ENV` in two
packages, and unset GitHub secrets/unlinked Railway) rather than crashing—it is safe to run at
any point in this process, including before anything is configured.

## First-deploy sequence

Once the four prerequisites and two out-of-band steps above are done:

Run `bun scripts/setup.ts` (or the individual phases in order) to write `.env.local`, create the
Neon project, collect Google credentials, collect a production `REDIS_URL`, set `BASE_URL` and
the trusted-proxy configuration, push the resulting variable set to Railway
(`railway variable set`, one key at a time, forcing `NODE_ENV=production` regardless of the local
machine's own mode), and set the four GitHub secrets under "What `production.yml` needs" above
(`NEON_PROJECT_ID`, `NEON_API_KEY`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SESSION_SIGNING_SECRET`,
and `RAILWAY_TOKEN`—six total, all from `MANAGED_GITHUB_SECRETS`). Set
`RAILWAY_SERVICE_NAME` by hand afterward (`gh variable set RAILWAY_SERVICE_NAME`)—the wizard
does not set it.

"It worked" at this point looks like: `bun scripts/setup.ts`'s final migration phase prints
`Migration completed successfully.` and `Connected.`; `bun run doctor --production` (run once
everything above is set, ideally against the real Railway shell environment rather than
`.env.local`) reports `All checks passed.`; and `gh secret list` shows all six managed secrets
plus `gh variable list` shows `RAILWAY_SERVICE_NAME`.

Push to `main`. `.github/workflows/production.yml` runs `migrate` then `deploy`, each gated by the
protected `production` environment created above:

- The `migrate` job checks out the exact pushed commit, records the pending Drizzle migration plan
  (`packages/database/drizzle/meta/_journal.json`), creates a Neon branch named
  `pre-migration-<sha>` via `neondatabase/create-branch-action`—this is the rollback evidence
  referenced below—then runs `bun scripts/migrate.ts` against `DATABASE_URL_UNPOOLED` (falling
  back to `DATABASE_URL`). "It worked" looks like: the job's "Run migrations" step succeeds with no
  `relation already exists` error (that specific error means the target database predates tracked
  migrations—stop and read the "Baselining" section of `packages/database/CLAUDE.md` before
  re-running anything against it, which does not apply on a first deploy against a fresh Neon
  project), and the final "Record rollback branch" step prints the Neon branch name and id to
  restore from if this revision needs to be rolled back.
- The `deploy` job runs only `needs: migrate`, checks out the same commit
  (`needs.migrate.outputs.revision`), and runs `bunx @railway/cli@5.43.1 up --service
"$RAILWAY_SERVICE_NAME" --detach --yes` authenticated with `RAILWAY_TOKEN`. "It worked" looks
  like: the job succeeds, and Railway's own dashboard shows a new active deployment for the
  service; `railway.toml`'s `healthcheckPath = "/health"` then gates traffic cutover on
  `GET /health` returning `{ "status": "ok" }`.

## Verification pass

Run these against the real deployed host once `deploy` has finished. Each invocation below is
copied exactly from `package.json` and each script's own argument parsing—get the flags exactly
right, since a couple of these are easy to get subtly wrong (a bare positional URL vs.
`-- --host URL`, `--token` vs. `--token-file`).

```sh
bun run test:deployed-smoke -- https://HOST
```

No local fallback—needs a real public DNS name and a real TLS certificate. Checks DNS
resolution, the TLS chain, all three discovery documents (well-formed JSON, no cross-host
redirect), and the unauthenticated `/mcp` 401 challenge. Confirmed directly (see "What I verified"
below): with no argument it prints a usage message and exits 1 rather than crashing; against an
unreachable host it prints one readable failure line per failed check (DNS, TLS, each discovery
document, `/mcp`) and exits 1—no stack trace.

```sh
bun run test:deployed-oauth -- https://HOST
```

Drives dynamic client registration, checks the resulting authorization URL shape, and exercises
the token endpoint's negative paths (invalid code, malformed grant) against the real deployed
host. Prints the manual browser-consent steps needed to actually finish an authorization at the
end (this part cannot be automated) and prints the `client_id` of the real `oauth_clients` row it
creates as a side effect—note it down and delete that row later (see "Removing a connector" in
`README.md`) since this server does not implement RFC 7592 client-configuration deletion.

```sh
bun run test:deployed-streaming -- https://HOST/mcp --token-file PATH
```

Proves the deployed reverse proxy does not buffer the `subscriptions/listen` SSE stream—this
cannot be checked locally, since the whole point is observing whatever proxy sits in front of the
real deployment. Needs a real bearer token: complete the manual steps `test:deployed-oauth` prints
first, save the resulting token to a file, and pass that file's path with `--token-file` (the
recommended form—a bare `--token BEARER_TOKEN` argument is also accepted but exposes the token in
this process's own argv, visible via `ps` and shell history, for the run's duration).

```sh
bun run test:connector:codex -- --host https://HOST
bun run test:connector:claude-code -- --host https://HOST
bun run test:connector:inspector -- --host https://HOST
```

The connector smoke harnesses (`INTEROP-001`)—with no `--host` argument they self-host this
server locally instead; passing `--host https://HOST` (note: `--host`, not a bare positional URL,
unlike the three `deployed-*` scripts above) points them at the real deployment instead. Each
automates discovery-document validation and the client-registration/connector-add-and-remove round
trip under an isolated profile, printing the manual browser-login steps at the point that cannot
be automated.

```sh
bun run test:graceful-shutdown
```

Local only—spawns the real entrypoint as a subprocess and proves no in-flight MCP request is
dropped or duplicated across `SIGTERM`. Does not need a live deployment; run it once locally as
part of the same verification pass.

## Rollback

**Migration succeeded, deploy is bad** (the application itself is misbehaving on the new code, but
the schema is fine): roll back through Railway's own deployment history to the prior image. Because
migrations here are additive and forward-only (no `down` migrations are generated or maintained),
this is safe exactly when every migration in the affected range was purely additive—the old code
can talk to the new (superset) schema. If a migration in that range was not purely additive (a
column removed or renamed, not just added), write and apply a hand-written reverse migration
before rolling back the application code, or the older code will fail against a schema it does not
expect.

**The migration itself is the problem**: restore the Neon branch the `migrate` job created before
running anything—`pre-migration-<sha>` (the exact sha of the bad commit), created and named in
the "Record rollback branch" step's own log output. Restore it through the Neon dashboard or API.
This is the state of the database immediately before the bad migration ran, independent of Neon's
own ongoing backups. After restoring, fix the migration itself, re-generate it if needed
(`bun turbo db:generate`), and re-run the sequence above from a new commit—do not attempt to
re-run `bun scripts/migrate.ts` against the restored branch without addressing whatever made the
original migration fail.

## What I verified vs. what is written down but unproven

Verified directly, with commands and real output, without deploying or touching any cloud
resource:

- `bun run doctor` (no `.env.local`, no environment configured) runs to completion and reports
  `3 failure(s), 8 warning(s).` with one specific, readable line per issue—confirmed it does not
  crash on a bare checkout.
- `bun run test:deployed-smoke` with no arguments prints its usage message and exits 1.
- `bun run test:deployed-smoke -- https://<a domain guaranteed not to resolve>` prints one readable
  failure line per failed check (DNS, TLS, three discovery documents, `/mcp`) and exits 1—no
  stack trace.
- `bun run test:deployed-streaming` and `bun run test:deployed-oauth` with no arguments both print
  their usage messages and exit 1.
- `bun run test:deployed-oauth -- https://<unreachable domain>` and
  `bun run test:deployed-streaming -- https://<unreachable domain>/mcp --token-file <file>` now
  print a single readable failure line and exit 1. Writing this runbook is what surfaced the
  original defect: both crashed with a raw Bun stack trace (a `ConnectionRefused` out of
  `connector-smoke-support.ts`'s `fetchJson`, and `ERA_NEGOTIATION_FAILED` out of the MCP SDK's
  own transport), which is what an operator would have hit first on a typo'd hostname or a
  deployment that is not serving yet. All three harnesses plus `connector-smoke-inspector` now
  share one error boundary (`runHarnessMain`), since the reason this was worth fixing is that
  `deployed-smoke.ts` already had the behavior and its siblings did not.

Written down but not exercised against a real deployment—these require the four
account-settings prerequisites and the two out-of-band steps, which are explicitly the owner's own
steps, not mine:

- The Neon project/Railway service/Redis instance/Google OAuth client creation steps themselves.
- Disabling Railway's deploy-on-push and creating the protected `production` GitHub environment.
- The setup wizard's live phases that call out to `neonctl`, `railway`, and `gh` (`setupNeon`,
  `setupRailway`, `setupGithubSecrets`)—read and traced through the code, not run, since running
  them would create real cloud resources.
- The actual `production.yml` `migrate`/`deploy` job run against a real push to `main`—including
  whether the Neon pre-migration branch snapshot step behaves as documented, and whether
  `railway up --service "$RAILWAY_SERVICE_NAME"` succeeds against a real linked service.
- `bun run doctor --production` against a fully configured real environment (only exercised
  against an empty one above).
- `test:deployed-smoke`/`test:deployed-oauth`/`test:deployed-streaming`/
  `test:connector:codex`/`test:connector:claude-code`/`test:connector:inspector` against a real,
  reachable deployed host and a real bearer token—only exercised for their no-argument and
  unreachable-host failure paths above, never their success path, since there is no live
  deployment to point them at.
- The rollback procedure (Neon branch restore, Railway deployment history rollback)—described
  from reading `production.yml` and `README.md`'s existing "Backup and rollback" section, never
  performed.
