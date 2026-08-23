# Skill: Setup

Provision and configure all services for the Bun + React MCP template. This skill orchestrates each phase with intelligent fallback: CLI tools first, then Neon MCP tools, then manual guidance.

The standalone script at `scripts/setup.ts` remains available for terminal use. This skill replaces the thin command wrapper with Claude-driven orchestration.

## General Approach

- Check CLI availability per phase with `which <cli>` via Bash
- If CLI available: run commands directly (do NOT invoke the interactive `bun scripts/setup.ts`)
- If CLI missing but MCP tools available: use MCP tools as fallback
- If neither: provide manual instructions and ask the user for values
- Write all configuration to `.env.local` using file edits (Read then Edit/Write)
- Before each phase, read `.env.local` to check for existing values — skip or confirm before overwriting
- Track the Neon project ID across phases (needed for GitHub secrets and migration)

## Phase 0: Environment Mode

`NODE_ENV` has no default — every environment must set it explicitly, or the server refuses to start (this is what keeps a host that forgets to set it from silently running as `development`, which is what makes `/auth/dev/login` reachable). Write `NODE_ENV=development` to `.env.local` if not already set.

## Phase 1: Neon Database

### With neonctl

1. Read `.env.local` — if `DATABASE_URL` already exists, ask user whether to create a new project or keep existing
2. Run `neonctl orgs list --output json` — if multiple organizations, present them and let user choose
3. Run `neonctl projects create --region-id aws-us-east-2 [--org-id <id>] --output json` — extract `project.id` from the JSON response
4. Run `neonctl connection-string --project-id <id> --pooled` — this is `DATABASE_URL`
5. Run `neonctl connection-string --project-id <id>` — this is `DATABASE_URL_UNPOOLED`
6. Write both to `.env.local`
7. Save the project ID for later phases

### Without neonctl (MCP fallback)

1. Use `mcp__Neon__list_organizations` to offer organization selection
2. Use `mcp__Neon__create_project` with `name` and optional `org_id`
   - **Note**: This MCP tool does not accept a `region_id` parameter — the default Neon region will be used. If the user specifically needs `aws-us-east-2`, advise them to use `neonctl` or the Neon dashboard instead.
3. Use `mcp__Neon__get_connection_string` with the `projectId` — returns a single connection string
4. Derive both connection string forms from the result:
   - If the hostname contains `-pooler`, that string is `DATABASE_URL`; remove `-pooler` from the hostname for `DATABASE_URL_UNPOOLED`
   - If the hostname does NOT contain `-pooler`, that string is `DATABASE_URL_UNPOOLED`; insert `-pooler` before the region suffix for `DATABASE_URL`
   - If the format is unclear, ask the user to check the Neon dashboard for both connection strings
5. Write both to `.env.local`

### Without either (manual)

1. Tell the user to create a project at https://console.neon.tech
2. Ask them to provide the pooled and unpooled connection strings
3. Write both to `.env.local`

## Phase 2: Session Configuration

No external tools required — pure generation.

1. Check `.env.local` for existing `SESSION_SIGNING_SECRET`
2. If missing, generate a 32-byte hex secret: run `openssl rand -hex 32` via Bash
3. Write to `.env.local`:
   - `SESSION_SIGNING_SECRET=<generated>`
   - `SESSION_COOKIE_NAME=application_session` (if not already set)
   - `SESSION_TIME_TO_LIVE_SECONDS=2592000` (if not already set)

## Phase 3: Google OAuth

Always manual — no CLI or MCP automation available.

1. Tell the user:
   - Open https://console.cloud.google.com/apis/credentials
   - Create an OAuth 2.0 Client ID
   - Add redirect URI: `http://localhost:3000/auth/google/callback` (development)
   - For production, also add: `https://<your-domain>/auth/google/callback`
2. Ask for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (allow skipping)
3. If provided, write both to `.env.local`

## Phase 4: Redis

1. Check `.env.local` for existing `REDIS_URL`
2. Ask the user for their Redis URL (default: `redis://localhost:6379`)
3. Write to `.env.local`:
   - `REDIS_URL=<provided or default>`
   - `RATE_LIMIT_REGISTER_MAX=10` (if not already set)
   - `RATE_LIMIT_REGISTER_WINDOW_SECONDS=60` (if not already set)
   - `RATE_LIMIT_TOKEN_MAX=30` (if not already set)
   - `RATE_LIMIT_TOKEN_WINDOW_SECONDS=60` (if not already set)

## Phase 5: MCP Protocol Configuration

Write defaults to `.env.local` if not already set:

- `MCP_ALLOWED_ORIGINS=http://localhost:3000` (ask user if they want a different value)
- `MCP_ENABLE_UI_EXTENSION=true`
- `MCP_CONFORMANCE_MODE=false`

## Phase 6: Railway

### With railway CLI

Do NOT hand-copy `.env.local` into Railway. `.env.local` carries local-machine-only values —
most importantly `NODE_ENV=development` — that must never reach a production deployment target:
copying `NODE_ENV=development` verbatim overrides the Docker image's baked-in
`NODE_ENV=production`, which makes `assertProductionStartupInvariants()` a no-op and leaves
`/auth/dev/login` reachable in production. `scripts/setup.ts`'s `setupRailway`/
`planRailwayVariables` already excludes every local-only key (`NODE_ENV`,
`DATABASE_LOCAL_PROXY_URL`, `PROTOKIT_TUNNEL_ACTIVE`, `REDIS_URL`) and always forces
`NODE_ENV=production`, plus collects a separately validated production `REDIS_URL`. Reuse it
instead of reimplementing that logic here:

1. Run `bun scripts/setup.ts railway` directly (interactive — it asks whether to configure
   Railway, runs `railway init -y`, prompts for a production `REDIS_URL` if `.env.local`'s is the
   local default, and pushes the filtered variable set). It refuses to proceed and names which
   phase to run first if `BASE_URL` or `TRUSTED_PROXY_CIDRS`/`TRUSTED_PROXY_HEADER` are not
   already in `.env.local` — if so, run `bun scripts/setup.ts base-url` and
   `bun scripts/setup.ts trusted-proxy` first, then re-run this phase.
2. Report success.

### Without railway CLI (manual guidance)

1. Tell the user to:
   - Install railway CLI: `npm install -g @railway/cli`
   - Or configure manually at https://railway.com/dashboard
   - Create a new project and set environment variables **derived from** `.env.local` — not
     copied verbatim. In particular, set `NODE_ENV=production` (never `development`) and supply a
     production-grade `rediss://` `REDIS_URL`, never the local `redis://localhost:6379` default.

## Phase 7: GitHub Secrets

### With gh CLI

The authoritative list is `scripts/utilities.ts`'s exported `MANAGED_GITHUB_SECRETS` — read it
before hand-listing secrets here, since it is the single source of truth `bun scripts/setup.ts
github` and `bun scripts/teardown.ts github` both already use. As of this writing it is
`NEON_PROJECT_ID`, `NEON_API_KEY`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and
`SESSION_SIGNING_SECRET`.

1. Ask the user if they want to set GitHub secrets for CI/CD.
2. Prefer running `bun scripts/setup.ts github` directly — it sets every managed secret from
   `.env.local`, always piping the value over stdin to `gh secret set` rather than passing it as an
   argv element. Do not construct a manual `gh secret set NAME <<< "$VALUE"` loop when this command
   already exists; use it.
3. Ask the user for `NEON_API_KEY` (needed for the pull-request workflow's Neon branch creation) if
   it is not already set — allow skipping.
4. `SKIP_ENV_VALIDATION` does not exist in this codebase (`CONFIG-001`) and must never be set as a
   secret or an environment variable anywhere, including CI — every `env.ts` throws immediately if
   it is present.

### Without gh CLI (manual guidance)

1. Tell the user to configure secrets at their GitHub repository's Settings > Secrets and variables > Actions.
2. List the secrets from `MANAGED_GITHUB_SECRETS` (see above) that this deployment target needs:
   `NEON_PROJECT_ID`, `NEON_API_KEY`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SESSION_SIGNING_SECRET`.

## Phase 8: Database Migration

1. Run `bun scripts/migrate.ts` via Bash
2. Optionally verify the migration succeeded:
   - If Neon MCP tools are available, use `mcp__Neon__run_sql` with `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'` to confirm tables were created
   - Otherwise, report the exit code from the migration script

## Completion

Report a summary of what was configured:

- Which phases completed successfully
- Which phases were skipped
- Any manual steps still pending

Suggest next steps:

1. `bun turbo dev` — start the development server
2. `bun scripts/develop.ts --tunnel` — expose the MCP endpoint. Do NOT suggest a bare
   `bunx cloudflared tunnel ...` invocation: it opens the tunnel without setting
   `PROTOKIT_TUNNEL_ACTIVE`, which is what disables `/auth/dev/login` while a tunnel is active
   (`CONFIG-001`; the same fix already applied to `.claude/commands/tunnel.md`).
3. `bunx @modelcontextprotocol/inspector` — debug MCP locally
