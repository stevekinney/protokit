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
   - Add redirect URI: `http://localhost:3000/api/auth/callback/google` (development)
   - For production, also add: `https://<your-domain>/api/auth/callback/google`
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

- `MCP_PROTOCOL_VERSION=2025-11-25`
- `MCP_ALLOWED_ORIGINS=http://localhost:3000` (ask user if they want a different value)
- `MCP_ENABLE_UI_EXTENSION=true`
- `MCP_ENABLE_CLIENT_CREDENTIALS=true`
- `MCP_ENABLE_ENTERPRISE_AUTH=true`
- `MCP_CONFORMANCE_MODE=false`
- Enterprise auth placeholders (empty values):
  - `ENTERPRISE_AUTH_PROVIDER_URL`
  - `ENTERPRISE_AUTH_TENANT`
  - `ENTERPRISE_AUTH_AUDIENCE`
  - `ENTERPRISE_AUTH_CLIENT_ID`
  - `ENTERPRISE_AUTH_CLIENT_SECRET`
  - `ENTERPRISE_AUTH_ALLOWED_CLIENT_IDS`

## Phase 6: Railway

### With railway CLI

1. Ask user if they want to configure Railway deployment
2. Run `railway init -y`
3. Read `.env.local`, and for each `KEY=VALUE` pair: run `railway variable set KEY="VALUE"`
4. Report success

### Without railway CLI (manual guidance)

1. Tell the user to:
   - Install railway CLI: `npm install -g @railway/cli`
   - Or configure manually at https://railway.com/dashboard
   - Create a new project and set environment variables from `.env.local`

## Phase 7: GitHub Secrets

### With gh CLI

1. Ask user if they want to set GitHub secrets for CI/CD
2. For each of these, pipe the value to `gh secret set NAME`:
   - `NEON_PROJECT_ID` — from the project ID saved in Phase 1
   - `DATABASE_URL` — from `.env.local`
   - `DATABASE_URL_UNPOOLED` — from `.env.local`
   - `SKIP_ENV_VALIDATION=true`
3. Ask the user for `NEON_API_KEY` (needed for the PR workflow Neon branch creation) — allow skipping
4. If provided, set it as `gh secret set NEON_API_KEY`

### Without gh CLI (manual guidance)

1. Tell the user to configure secrets at their GitHub repository's Settings > Secrets and variables > Actions
2. List the secrets they need to set:
   - `NEON_PROJECT_ID`
   - `NEON_API_KEY`
   - `DATABASE_URL`
   - `DATABASE_URL_UNPOOLED`
   - `SKIP_ENV_VALIDATION=true`

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
2. `bunx cloudflared tunnel --url http://localhost:3000/mcp` — expose MCP endpoint
3. `bunx @modelcontextprotocol/inspector` — debug MCP locally
