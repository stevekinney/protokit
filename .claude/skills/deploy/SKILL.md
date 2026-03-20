# Skill: Deploy

Deploy the application to Railway via CLI. The `railway` CLI is required — there is no MCP fallback for Railway deployment.

## Prerequisites

Before starting, verify:

1. `which railway` — the Railway CLI must be installed
2. `railway status` — a project must be linked
3. If either check fails, stop and tell the user what to install or configure

## Phase 1: Pre-Deploy Checks

Run each check sequentially. Stop on the first failure.

1. `bun turbo typecheck` — type errors are a hard stop
2. `bun turbo lint` — lint errors are a hard stop
3. `bun turbo test` — test failures are a hard stop
4. `bun turbo build` — build failures are a hard stop
5. `bun scripts/doctor.ts` — warnings are reported but do not block; failures are a hard stop

If any check fails, report the error output and stop. Do not proceed to deployment.

## Phase 2: Deploy

1. Run `railway up --detach`
2. Report the deployment output

## Phase 3: Post-Deploy Verification

1. Run `railway domain` to get the deployment URL
2. Wait briefly (a few seconds), then run `curl -sf https://<domain>/health`
3. If the health check succeeds, report success
4. If the health check fails:
   - Run `railway logs --tail 50` to capture recent logs
   - Report the logs and suggest investigating the failure

## Phase 4: Post-Deploy Migration (optional)

1. Ask the user if database migrations need to run against production
2. Note that migrations are normally handled by the `production.yml` GitHub Action on push to `main`
3. If the user wants to run them manually, they can use the Neon dashboard or connect directly
