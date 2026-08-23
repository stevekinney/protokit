# Bun + React MCP Template

A template for building [Model Context Protocol](https://modelcontextprotocol.io) servers with Bun and React: dual-era protocol support, OAuth 2.1 + PKCE with RFC 8707 resource indicators and least-privilege scopes, Google sign-in, and Railway deployment.

This repository tracks its own hardening work in `ROADMAP.local.md` and `PROGRESS.local.md` — read those for the reasoning behind a given control if this document's summary isn't enough. `THREAT-MODEL.md`, `RUNBOOK.md`, and `SECRETS-ROTATION.md` are the deeper operator references this README links out to rather than duplicates.

## What You Get

- An MCP server at `/mcp` on the official MCP TypeScript SDK v2 (`@modelcontextprotocol/core`/`server`/`client`, not the v1 `@modelcontextprotocol/sdk`), serving the current `2026-07-28` protocol revision statelessly and falling back to `2025-11-25` (Claude's hosted-connector maximum as of this writing) through the SDK's own stateless legacy lane — one factory, two eras, no hand-written transport.
- An OAuth 2.1 authorization server: dynamic client registration (RFC 7591) or Client ID Metadata Documents, PKCE `S256`, RFC 8707 resource indicators, RFC 9207 issuer identification, least-privilege scopes enforced per tool call, and client-bound atomic token rotation and revocation.
- Google OAuth sign-in for the web UI (`/auth/google/start`, `/auth/google/callback`), independent of the OAuth authorization server above.
- Postgres via Neon (HTTP driver) + Drizzle ORM.
- Redis-backed atomic rate limiting, concurrency limits, and failed-authentication lockouts — required in production, with a single-process in-memory fallback for local development only.
- Tailwind v4 styling for server-rendered React pages; the OAuth consent screen ships no client-side JavaScript at all, by design.
- A `doctor` command that derives every check from the same Zod schemas the server validates its own configuration against, so a new required variable is caught automatically rather than needing a second, hand-maintained list.
- Monorepo with Bun + Turborepo.

## Project Structure

```text
applications/web/          Bun + React SSR app (UI + OAuth + MCP transport)
packages/database/         Drizzle schema, migrations, shared database client
packages/mcp/              MCP server factory, tool/resource/prompt definitions, shared logger
packages/mcp-apps/         MCP Apps (interactive UI) build pipeline — no application ships in this template yet
scripts/                   Setup wizard, doctor, migration runner, secret rotation, audits
```

## Quick Start

Install dependencies:

```sh
bun install
```

Create `.env.local` in the repository root. `NODE_ENV` has no default anywhere in this codebase —
every entry point must set it explicitly:

```sh
NODE_ENV=development
DATABASE_URL=<pooled connection string, sslmode=verify-full>
DATABASE_URL_UNPOOLED=<direct connection string, sslmode=verify-full>
```

Everything else is optional in development: `SESSION_SIGNING_SECRET` is auto-generated if unset (sessions won't survive a restart), Google sign-in is optional (use `GET /auth/dev/login` instead, development-only and automatically disabled the moment a tunnel is active), and `REDIS_URL` falls back to a single-process in-memory limiter. See `.env.example` for the complete, currently accurate variable list with defaults and production requirements — that file, not this one, is the source of truth for any variable's exact default.

Run `bun run doctor` at any point to see exactly what's configured, what's missing, and what production would additionally require — it reads the same environment schemas the server validates against, so it never falls out of sync with what's actually enforced.

Generate the schema and apply migrations:

```sh
bun turbo db:generate
bun scripts/migrate.ts
```

Start development:

```sh
bun turbo dev
```

The web server runs on `http://localhost:3000` by default (`PORT`). Outside production it binds to loopback (`127.0.0.1`) unless `SERVER_BIND_ADDRESS` is set explicitly — set it to `0.0.0.0` when running inside a container, where loopback binding makes a published port unreachable.

To expose the local server publicly for testing a real MCP client, use `bun scripts/develop.ts --tunnel` (or the `tunnel` slash command) rather than running `cloudflared` directly against an already-running dev server — the tunnel flow starts its own dev server with the development login bypass and conformance fixtures disabled for the duration of the tunnel.

## Connecting an MCP Client

See `CONNECTORS.md` for exact, verified setup and removal commands for Claude hosted connectors, Claude Code, Codex CLI, Codex desktop, and ChatGPT, plus the scopes, rate limits, result-size limits, and unsupported host capabilities every client should expect.

## Environment Variables

`.env.example` is the authoritative, currently accurate list of every variable this codebase reads, with defaults and production requirements documented inline. Do not treat this README as a second source of truth for defaults — they drift, `.env.example` doesn't (it's checked by this repository's own documentation audit). At a glance:

- Owned by `packages/database`: `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (both required, `sslmode=verify-full` in production).
- Owned by `packages/mcp`: `MCP_SERVER_NAME`, `MCP_CONFORMANCE_MODE`, `LOG_LEVEL`, `LOG_CONTENT_DIAGNOSTICS_UNTIL` (refused outright in production), `NODE_ENV`.
- Owned by `applications/web`: `BASE_URL`, `SESSION_SIGNING_SECRET` (+ `SESSION_SIGNING_SECRET_PREVIOUS` during a rotation overlap window), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `REDIS_URL`, `MCP_ALLOWED_ORIGINS`, `MCP_TOKEN_TTL_SECONDS`/`MCP_REFRESH_TOKEN_TTL_SECONDS`, every `RATE_LIMIT_*` pair, `TRUSTED_PROXY_CIDRS`/`TRUSTED_PROXY_HEADER`/`TRUSTED_PROXY_HOP_COUNT`, `METRICS_API_KEY`, `HEALTH_READINESS_API_KEY`, `SERVER_BIND_ADDRESS`, `PORT`, `NODE_ENV`.

`SKIP_ENV_VALIDATION` does not exist in this codebase under any name — every `env.ts` throws immediately if it is set, rather than silently bypassing the Zod schema (including its defaults, which is exactly what caused a real production-shaped defect documented in `PROGRESS.local.md`).

## Commands

```sh
bun turbo dev
bun turbo build
bun turbo typecheck
bun turbo lint
bun turbo format
bun turbo test
bun turbo db:generate
bun turbo db:validate
bun run doctor
```

## Testing

- `applications/web`, `packages/database`, and `packages/mcp` all use `bun:test`, run together with `bun turbo test`.
- Several suites need real Postgres and Redis rather than mocks — `test:infrastructure:up` starts a local Postgres container plus a vendored Neon HTTP proxy (`docker-compose.test.yml`), because this template's database driver speaks Neon's HTTP protocol, not the Postgres wire protocol. `test:infrastructure:migrate` applies migrations to that stack; `test:infrastructure:down` tears it down. See `packages/database/CLAUDE.md` for the full local test-infrastructure workflow, and `ROADMAP.local.md`'s release-gate command list for the complete set of named verification and security scripts (`test:security`, `test:rate-limit-concurrency`, `test:oauth:interop`, `test:conformance:modern`/`:legacy`, and more).

Run every package's tests with:

```sh
bun turbo test
```

## Deployment, Migrations, and Operations

See `RUNBOOK.md` for what this server logs and measures, how to read it without inspecting a secret, and what to do when a named alert condition fires; `SECRETS-ROTATION.md` for the rotation and revocation procedure for every credential class this template issues or depends on; and `THREAT-MODEL.md` for the assets, actors, entry points, and mitigations this codebase actually implements — not an aspirational list.

### Railway

- The `Dockerfile` builds a multi-stage, non-root (`USER 65532:65532`) production image with a container `HEALTHCHECK`.
- `railway.toml` starts the server with `bun applications/web/dist/server.js`, points Railway's own health check at `/health`, and restarts on failure.
- The production GitHub Actions workflow runs database migrations against `main`.

### Backup and rollback

Database backups and point-in-time recovery are a property of the Neon project this deployment targets, not something this codebase implements — use Neon's branching/restore tooling. A code rollback is an ordinary Railway deployment rollback to a prior image; because migrations here are additive and forward-only (no `down` migrations are generated or maintained), rolling back the application code while a newer migration has already applied can leave the older code talking to a newer schema — coordinate a schema rollback (a hand-written reverse migration) before rolling back application code if a migration in the affected range wasn't purely additive. `production.yml`'s `migrate` job also snapshots a Neon branch (`pre-migration-<sha>`) before applying anything, giving every deploy a point-in-time database rollback target independent of Neon's own ongoing backups.

### Public deployment envelope (`OPS-001`)

What "a public remote connector deployment" actually requires of the runtime, verified against what this codebase does and does not implement:

- **Database and Redis connection limits.** The application's runtime database client (`@neondatabase/serverless`, Neon's HTTP driver) is connectionless — every query is one HTTP request, so there is no pool to size and no "too many open connections" failure mode at the application layer. Redis is a single long-lived `ioredis` client per process, reused for rate limiting, session pub/sub, and the MCP subscription event bus; size the Redis provider's own max-clients limit for `(replica count) × 1`, not per-request.
- **Cleanup jobs.** `startScheduledCleanup` (`server.ts`) runs an in-process, batched sweep on `SCHEDULED_CLEANUP_INTERVAL_SECONDS` that expires stale OAuth codes/tokens/refresh tokens/authorization transactions and sessions. `scripts/cleanup-expired-data.ts` runs the identical sweep as a one-shot command, for a deployment topology that does not keep a long-lived process alive (a scheduled job runner instead of `server.ts`'s own interval).
- **Graceful shutdown.** `SIGTERM`/`SIGINT` stop accepting new connections (`server.stop(false)`), then wait for every request the process was already handling to actually finish — proven, not just implemented: `Bun.serve(...).stop(false)` returns immediately and does **not** wait for in-flight handlers on its own (confirmed empirically), so `server.ts` tracks in-flight requests itself (`lib/in-flight-request-tracker.ts`) and drains them, bounded by a 10-second forced-exit timeout, before closing MCP transports or the Redis connection. `applications/web/src/graceful-shutdown.integration.test.ts` spawns the real entrypoint as a subprocess and asserts every in-flight MCP request either completes with its own unique result or is cleanly cut off by the forced-exit timeout — never duplicated.
- **Zero-downtime migrations.** Migrations are additive and forward-only by convention (see Backup and rollback above); `production.yml` applies them in a `migrate` job gated behind a protected `production` GitHub environment before a separate `deploy` job runs, so a new schema is live before any replica running new code starts serving traffic, and a failed migration blocks deploy outright (`needs: migrate`, no `if: always()` override).
- **Egress allowlisting.** Not required by this codebase's own outbound traffic: the server calls exactly three external hosts, all over ordinary HTTPS with no fixed IP dependency — Neon (`DATABASE_URL`'s host), the configured Redis provider (`REDIS_URL`'s host), and Google's OAuth/OpenID endpoints (`accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`). If a deployment network requires an explicit egress allowlist, these three hostnames — not IP ranges, which Google and most managed Postgres/Redis providers rotate — are the complete list; nothing else this server does needs outbound network access.
- **Proxy buffering, idle timeouts, and cross-host redirects.** The canonical MCP resource, OAuth issuer, and every discovery document are all derived from one configured `BASE_URL` (`lib/base-url.ts`), never inferred per-request, so a correctly configured reverse proxy in front of this server introduces no additional host and therefore no cross-host redirect surface. The MCP transport's SSE stream sends a `: keepalive` comment frame every 15 seconds (`@modelcontextprotocol/server`'s default); a proxy or load balancer's idle timeout must exceed that, and response buffering must be disabled for `text/event-stream` — Nginx's `proxy_buffering off`, or the equivalent on whatever reverse proxy actually sits in front of a given deployment (Railway's own edge does not buffer by default, but this is a real constraint for any operator fronting this server with something else).

**Ready-to-run harnesses against a live deployment** (see `ROADMAP.local.md`'s `OPS-001` entry for the full acceptance criteria):

```sh
bun run test:deployed-smoke -- https://HOST                          # DNS, TLS, discovery, no cross-host redirects, /mcp challenge
bun run test:deployed-oauth -- https://HOST                          # DCR, authorize URL shape, token endpoint negative paths
bun run test:deployed-streaming -- https://HOST/mcp --token-file PATH    # proves the deployed proxy does not buffer the SSE stream
bun run test:graceful-shutdown                                       # local, real subprocess: no dropped or duplicated in-flight results
```

`test:deployed-streaming` needs a real bearer token, which needs a human to click through a real browser OAuth consent screen — `test:deployed-oauth` prints the exact manual steps to get one. None of the first three can be run against a self-hosted local instance; there is no substitute for a real public DNS name, a real TLS certificate, and whatever reverse proxy actually sits in front of a live deployment. This template does not itself have a deployed instance to validate against — running these against a real deployment, and the standing out-of-band Railway/GitHub-environment prerequisites `production.yml` documents inline, are the operator's responsibility before calling a deployment production-ready.

### Incident response

Start from `RUNBOOK.md`'s alert conditions and outcome table to identify what actually happened (an `event`/`outcome` pair, never a raw token or secret). For a suspected credential compromise, `SECRETS-ROTATION.md` has the exact rotation procedure for every credential class, including the session-signing secret's overlap-then-cutover rotation and client-bound, atomic OAuth token revocation. For a suspected under-scoped or over-permissioned MCP client, `THREAT-MODEL.md`'s trust-boundary sections name the control that should have stopped it and its residual risk.

### Removing a connector

Revoke every outstanding token for a client with `POST /oauth/revoke`, or remove the client's row entirely (see `SECRETS-ROTATION.md`'s OAuth client credentials section) to stop it from completing any further authorization. On the client side, see `CONNECTORS.md` for the exact removal command for each supported host.

### CI

- The pull request workflow runs typecheck, lint, test, build, and MCP conformance checks (`test:conformance:modern`, `test:conformance:legacy`).
- The production workflow runs database migrations on `main`.

## Privacy, Terms, and Support

This server publishes its privacy policy, terms of service, and support contact at `/privacy`, `/terms`, and `/support`, and links them from both authorization server metadata (RFC 8414 `service_documentation`/`op_policy_uri`/`op_tos_uri`) and protected-resource metadata (RFC 9728 `resource_name`/`resource_documentation`/`resource_policy_uri`/`resource_tos_uri`) so a connecting client or reviewing host can discover them without a separate out-of-band link. Every one of those pages is real template-operator content — data categories, retention, deletion, and subprocessors named by the services this deployment actually depends on (Neon, a Redis provider, Railway, Google) — not placeholder text; replace the operator identity and contact details with your own before deploying.

## Registry Manifest

`server.json.example` is a registry descriptor template. Copy it to `server.json` (git-ignored) and replace every placeholder domain with your real deployment's domain before submitting to an MCP registry — a `server.json` still containing placeholder values is not ready to publish.

## License

MIT
