# Skill: Teardown

Remove configured services and clean up the Bun + React MCP template environment. Every destructive action requires explicit user confirmation before proceeding.

The standalone script at `scripts/teardown.ts` remains available for terminal use. This skill replaces the thin command wrapper with Claude-driven orchestration and MCP fallback.

## General Approach

- Check CLI availability per phase with `which <cli>` via Bash
- If CLI available: run commands directly (do NOT invoke the interactive `bun scripts/teardown.ts`)
- If CLI missing but MCP tools available: use MCP tools as fallback
- If neither: provide manual instructions
- Always confirm before each destructive action — never assume consent
- Track what was removed vs skipped for the final report

## Phase 1: GitHub Secrets

### With gh CLI

1. Run `gh secret list` to find which managed secrets exist
2. Managed secrets (from `scripts/utilities.ts`):
   - `NEON_PROJECT_ID`
   - `NEON_API_KEY`
   - `DATABASE_URL`
   - `DATABASE_URL_UNPOOLED`
   - `SESSION_SIGNING_SECRET`
   - `SKIP_ENV_VALIDATION`
3. Report which managed secrets are present
4. Ask for confirmation before deleting
5. For each confirmed secret: run `gh secret delete <NAME>`

### Without gh CLI (manual)

1. Tell the user to remove these secrets from their GitHub repository's Settings > Secrets and variables > Actions:
   - `NEON_PROJECT_ID`, `NEON_API_KEY`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SESSION_SIGNING_SECRET`, `SKIP_ENV_VALIDATION`

## Phase 2: Railway

### With railway CLI

1. Run `railway status` to check if a project is linked
2. If linked, ask for confirmation to unlink
3. Run `railway unlink`

### Without railway CLI (manual)

1. Tell the user to remove the service from https://railway.com/dashboard if needed

## Phase 3: Environment File

1. Check if `.env.local` exists
2. If it exists, ask for confirmation before deleting
3. Delete `.env.local`

## Phase 4: Neon Database

This is the most destructive phase — project deletion is irreversible.

### With neonctl

1. Run `neonctl projects list --output json` to list all projects
2. Try to match the configured project by checking if `DATABASE_URL` from `.env.local` (if it still exists) contains the project ID
3. If a match is found, show the project name and ID and ask for confirmation
4. If no match, list all projects and let the user select one (or skip)
5. **Require the user to type the project name to confirm deletion** — do not accept just "y"
6. Run `neonctl projects delete <project-id>`

### Without neonctl (MCP fallback)

1. Use `mcp__Neon__list_projects` to find projects
2. If `.env.local` still exists, try to match the configured project against `DATABASE_URL`
3. Show the project name and ID, ask for confirmation
4. **Require the user to type the project name to confirm deletion**
5. Use `mcp__Neon__delete_project` with the `projectId`

### Without either (manual)

1. Tell the user to delete the project at https://console.neon.tech

## Completion

Report a summary:

- What was removed (with specific names/IDs)
- What was skipped (and why — user declined, CLI missing, etc.)
- Any manual steps still needed
