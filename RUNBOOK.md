# Observability Runbook

This is the operator-facing runbook required by the roadmap's `OBS-001` item: what this server logs and measures for OAuth and MCP traffic, how to read it without ever needing to inspect a secret, and what to do when one of the named alert conditions fires. See `packages/mcp/src/logger.ts` for the redaction configuration this document assumes is in place, and `packages/mcp/src/metrics.ts` for the in-process metrics collector `/metrics` (`applications/web/src/routes/metrics-routes.ts`, gated behind `METRICS_API_KEY`) serves.

This repository ships no hosted dashboard or alerting backend of its own — that is intentionally out of scope for a template. Every alert condition below is defined against a concrete log field or metric this codebase actually emits, so wiring it into whatever an operator's real deployment uses (a log-based alert in their aggregator, a Prometheus scrape of `/metrics`, a scheduled query) is mechanical rather than a guess.

## What gets logged, and what does not

Every log line goes through `packages/mcp/src/logger.ts`'s pino instance, which:

- Redacts a named list of credential-shaped keys (`authorization`, `cookie`, `token`, `access_token`, `refresh_token`, `id_token`, `code`, `code_verifier`, `code_challenge`, `client_secret`, `password`, `DATABASE_URL`, `REDIS_URL`, `email`, and one-level-nested variants of each) wherever they appear on a logged object, replacing the value with `[REDACTED]`.
- Additionally scrubs three value SHAPES anywhere in the fully serialized log line, regardless of key: a `Bearer <token>` string, a JWT (`eyJ...`), and a Postgres/Redis connection string carrying inline credentials. This catches a secret an object-key scan cannot — one interpolated into a free-text error message.
- Never logs a user's prompt/tool input content by default. `summarize`'s `topic` argument logs only as `topicLength` unless the explicit `LOG_CONTENT_DIAGNOSTICS_UNTIL` diagnostic window is active (below).

`packages/mcp/src/redaction.test.ts` is the automated proof: it logs one representative canary value per credential type through the real logger config and asserts none survive serialization. `bun run audit:logs` is the static complement — it scans every shipped source file for a credential-shaped variable interpolated directly into a log MESSAGE string (the one shape key-based redaction cannot reach at all).

## Diagnostic content-logging mode

`LOG_CONTENT_DIAGNOSTICS_UNTIL` (an ISO 8601 timestamp) is the explicit, time-bounded escape hatch for logging raw prompt content instead of a pseudonymous length. It:

- Is refused outright at startup in production (`packages/mcp/src/env.ts`) — setting it in a production environment crashes the process rather than silently taking effect.
- Only logs content while `Date.now()` is before the configured timestamp — a diagnostic session left configured does not silently become permanent.
- Emits its own `warn`-level audit line (`Content diagnostics mode active: logging raw prompt topic`) every time it causes content to be logged, so its use is itself visible in the log stream, not just inferable from the presence of raw content.

Turn it on only for a bounded local/staging debugging session, and turn it back off (or let the timestamp lapse) as soon as the session ends.

## Distinguishing outcomes without inspecting secrets

Every log line below carries an `event` field naming the surface and an `outcome` field naming the specific result — search on those two fields, never on a token, code, or secret value. `requestId` (propagated from the HTTP boundary through OAuth validation and, for `/mcp` traffic, into every tool/resource/prompt handler — see `applications/web/src/lib/mcp-request-context.ts` and `packages/mcp/src/types/primitives.ts`) ties one connector action's log lines together end to end.

| Outcome                                       | `event` / `outcome`                                                                                                                                                   | Where                                                                                   | Notes                                                                                                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client registration                           | `event: "oauth_client_registration"`, `outcome: "success"`                                                                                                            | `applications/web/src/routes/oauth-routes.tsx`                                          | Logs the issued `clientId`, never the secret.                                                                                                                                                                                           |
| User denial                                   | `event: "oauth_authorization"`, `outcome: "user_denied"`                                                                                                              | `oauth-routes.tsx` (deny handler)                                                       |                                                                                                                                                                                                                                         |
| Invalid client                                | `event: "oauth_client_authentication"`, `outcome: "invalid_client"`                                                                                                   | `oauth-routes.tsx` (`authenticateOauthClient`, shared by token exchange and revocation) | Logs the caller-presented `clientId`, never the credential it failed with.                                                                                                                                                              |
| Invalid resource (RFC 8707 audience mismatch) | `event: "oauth_token_exchange"`, `outcome: "invalid_resource"` (token/refresh grants); `event: "mcp_authentication"`, `outcome: "invalid_resource"` (`/mcp` boundary) | `oauth-routes.tsx`, `applications/web/src/routes/mcp-routes.ts`                         | The `/mcp` boundary case is deliberately identical on the wire to "expired or invalid token" (RFC 6750 §3.1 — collapsing them prevents a caller probing which reason applies); the log line is where they are actually distinguishable. |
| Insufficient scope                            | `event: "mcp_tool_call"`, `outcome: "insufficient_scope"`                                                                                                             | `packages/mcp/src/server.ts`                                                            | Logs the tool name and the scope it required, never the caller's actual (insufficient) scope set.                                                                                                                                       |
| Expired or invalid token                      | `event: "mcp_authentication"`, `outcome: "expired_or_invalid_token"`                                                                                                  | `mcp-routes.ts`                                                                         | See the "invalid resource" row above for why the HTTP response is identical.                                                                                                                                                            |
| Tool failure                                  | `event: "mcp_tool_call"`, `outcome: "tool_failure"`                                                                                                                   | `packages/mcp/src/server.ts`                                                            | Logged when a tool handler returns `isError: true`. Never logs tool input or output. Distinct from `mcp_transport` below — this is a structured result the handler itself produced.                                                     |
| Transport failure                             | `event: "mcp_transport"` (on the `err` object's message)                                                                                                              | `applications/web/src/lib/mcp-handler.ts` (`onerror`)                                   | The SDK's own catch-all for a request the transport layer could not serve at all (malformed JSON-RPC, a stream closing mid-response) — as opposed to a tool returning a structured error result.                                        |

Two more outcomes worth knowing even though they are not in the roadmap's original eight:

- **Refresh replay** (a revoked refresh token presented again): `event: "oauth_token_exchange"`, `outcome: "refresh_replay"`, at `warn` level, carrying only the token family id. This is also the alert source named below.
- **Revocation**: `metricsCollector`'s `revocation` category (`access_token_revoked` / `refresh_token_revoked` / `not_found_or_already_revoked`) — RFC 7009 §2.2 requires an identical `200` response for all three on the wire, so this is metrics-only, not logged per request.

## Metrics

`metricsCollector.snapshot()` (served at `/metrics` when `METRICS_API_KEY` is configured) returns:

- `tools`: per-tool invocation count, error count, and p50/p95/p99 latency — unchanged from before this item.
- `events`: a `category -> outcome -> count` map. Categories currently populated: `registration`, `authorization`, `client_authentication`, `token_exchange`, `refresh`, `revocation`, `mcp_method`. A category or outcome is added at its call site with no change to the collector itself — see `packages/mcp/src/metrics.ts`.

## Alert conditions

Each of these is a query an operator wires into their own log aggregator or a threshold against `/metrics`; none of them exists as a running alert in this repository.

- **Anonymous registration attempts**: an elevated rate of `event: "oauth_client_registration"` / `outcome: "success"` from a single network identity, or an elevated `429` rate on `POST /oauth/register` (already rate-limited by `SEC-003`; a spike against that limit is itself the signal).
- **Refresh replay**: any occurrence of `event: "oauth_token_exchange"` / `outcome: "refresh_replay"`. This should be rare-to-never in legitimate traffic — a single occurrence is worth investigating, not just counting.
- **Repeated audience failure**: a sustained rate of `outcome: "invalid_resource"` (either surface) from one client or network identity — suggests a misconfigured or probing client.
- **Elevated authorization failure**: a sustained rate of `event: "oauth_client_authentication"` / `outcome: "invalid_client"`, or of `event: "mcp_authentication"` / `outcome: "expired_or_invalid_token"` — credential stuffing or a client shipping a stale/incorrect secret.
- **Connector latency or error regression**: `tools.<name>.p95`/`p99` or `tools.<name>.errors` climbing relative to the same tool's historical baseline, read from `/metrics`.

## Retention and access

- Structured logs go to process stdout (JSON in production, pretty-printed in development via `pino-pretty`) — this repository does not persist them itself. Retention, access control, and any further redaction-on-ingest are the responsibility of whatever log sink the deployment platform forwards stdout to (e.g. Railway's log drain to an operator-chosen aggregator). Configure that sink's own access controls to the same standard as any other system that receives (already-redacted, but defense-in-depth still matters) request metadata — least-privilege read access, not open to every engineer by default.
- `/metrics` is access-controlled by `METRICS_API_KEY` (a bearer token compared in constant time — `applications/web/src/routes/metrics-routes.ts`) and returns `404` (not `401`) when unconfigured, so its mere existence is not discoverable without the key.
- `GET /health` is public and dependency-free (`{ status: "ok" }` only — no instance identifier, protocol versions, extensions, or dependency status). Dependency detail lives at `GET /health/ready`, gated by `HEALTH_READINESS_API_KEY` the same way `/metrics` is gated by `METRICS_API_KEY`, and its Postgres/Redis probe is cached and coalesced for `HEALTH_READINESS_CACHE_TTL_SECONDS` (default 2) so a burst of authenticated callers cannot multiply real dependency connection work (`OPS-002`).
- Metrics are in-process and reset on restart — there is no metrics database to separately retain or purge.

## Verification

```sh
bun test packages/mcp
bun test applications/web
bun run test:observability
bun run audit:logs
```
