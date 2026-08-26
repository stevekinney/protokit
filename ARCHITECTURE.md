# Architecture

## Overview

This template provides a production-ready remote MCP (Model Context Protocol) server with OAuth 2.1 authentication. It is built on Bun, server-rendered Svelte 5, Neon Postgres (via Drizzle ORM), and Redis. The system supports multi-instance deployments backed by the official MCP SDK's stateless transport and a shared, atomic Redis-backed sliding-window rate limiter.

## Monorepo Layout

| Package             | Responsibility                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applications/web`  | Bun-native HTTP server, Svelte 5 SSR views, OAuth 2.1 endpoints, MCP transport layer, cookie session management                                                                                                     |
| `packages/database` | Drizzle ORM schema (`users`, `user_sessions`, `user_google_accounts`, `oauth_clients`, `oauth_codes`, `oauth_tokens`, `oauth_refresh_tokens`, `mcp_sessions`), migrations, shared database client for Neon Postgres |
| `packages/mcp`      | MCP server factory (`createMcpServer`), tool/resource/prompt definitions, server instructions, shared pino logger                                                                                                   |

## Request Flow

Every HTTP request passes through three layers:

1. **`server.ts`** -- Bun's built-in `Bun.serve` entrypoint. Serves pre-resolved static files (favicon, CSS, robots.txt) via Bun's `static` option. All other requests are forwarded to `handleApplicationRequest`.

2. **`application.ts`** -- The application layer. Each request gets:
   - A unique request ID (`X-Request-Id` header).
   - Static file resolution for anything under `/assets/`.
   - Session hydration: the cookie is read, the token is hashed, and the `user_sessions` table is queried to build a `RequestContext` containing the authenticated user (or `null`).
   - Dispatch to the matching route handler based on pathname and HTTP method.
   - Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`, `X-Frame-Options` on `/oauth/authorize`).
   - Structured request logging (method, path, status, duration, user ID).

3. **Route handlers** -- Plain functions that receive a `RequestContext` and return a `Response`. There is no framework router; dispatch is a sequential `if` chain in `application.ts`.

```
Bun.serve (server.ts)
	-> static file? return cached Response
	-> handleApplicationRequest (application.ts)
		-> static asset under /assets/? return file
		-> hydrateSession (cookie -> database lookup)
		-> dispatch (pathname + method matching)
			-> route handler (returns Response)
		-> attach security headers + request ID
```

## Authentication Architecture

The system maintains two independent authentication mechanisms:

### User Sessions (Web UI)

Cookie-based sessions authenticate human users interacting with the web interface (home page, OAuth consent screen, sign-in/sign-out).

- On sign-in (via Google OAuth), a 48-byte random token is generated.
- The token is SHA-256 hashed and stored in the `user_sessions` table alongside the user ID, expiration timestamp, and user agent.
- The plaintext token is set as an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- On each request, `hydrateSession` hashes the cookie value and queries the database for a valid (non-revoked, non-expired) session.
- On sign-out, the session row is marked as revoked and the cookie is expired.

Why cookie sessions instead of JWT: server-side sessions with a hash stored in the database are immediately revocable. A revoked session is rejected on the very next request. JWTs, by contrast, remain valid until expiration and expose claims to the client. Storing only the hash in the database means a database breach does not leak usable session tokens.

### OAuth 2.1 (MCP Clients)

Bearer token authentication protects the `/mcp` endpoint for programmatic MCP clients (Claude Desktop, IDE extensions, custom integrations).

- Clients register dynamically via `POST /oauth/register` and receive a `client_id` and `client_secret`.
- Clients obtain an authorization code through the consent screen, then exchange it for an access token and refresh token at `POST /oauth/token`.
- The `/mcp` endpoint validates the `Authorization: Bearer <token>` header by hashing the token and looking it up in the `oauth_tokens` table.
- Tokens are hashed with SHA-256 before storage. The plaintext token is never persisted.

## MCP Transport

The MCP server is built on the official MCP TypeScript SDK v2 (`@modelcontextprotocol/core`,
`@modelcontextprotocol/server`, `@modelcontextprotocol/client`, all pinned to `2.0.0`) — not the v1
`@modelcontextprotocol/sdk` package, which tops out at protocol revision `2025-11-25`. `PROTO-001`
replaced a hand-written, stateful Streamable HTTP transport (session IDs, an in-memory transport
map, Redis-backed cross-instance session ownership) with `createMcpHandler` from
`@modelcontextprotocol/server` (`applications/web/src/lib/mcp-handler.ts`), which owns Streamable
HTTP entirely and speaks two protocol eras from one factory:

- **`2026-07-28`** (the current revision): stateless per-message dispatch — no `initialize`
  handshake, no `mcp-session-id` header, no server-side session to lose on restart or to route to a
  particular instance.
- **`2025-11-25`** (Claude's hosted-connector maximum as of this writing — see the compatibility
  contract in `ROADMAP.local.md`): served through the SDK's own built-in stateless fallback
  (`legacy: 'stateless'`), not a second hand-rolled transport. When Anthropic documents `2026-07-28`
  support for hosted connectors, this lane and its dedicated conformance tests
  (`test:conformance:legacy`) are meant to be removed in one direct change, not kept indefinitely.

`mcpSupportedProtocolVersions` (`applications/web/src/lib/mcp-protocol-constants.ts`) is the single
source of truth for which revisions are actually served; a metadata document that claims a version
this constant doesn't list would be exactly the kind of gap `META-001` exists to prevent.

- **POST /mcp** — every JSON-RPC message for both eras.
- **GET /mcp** — a persistent stream for server-initiated messages under `2026-07-28`'s
  `subscriptions/listen` mechanism (see "Resource update delivery" below); not meaningful for the
  stateless legacy lane, which has no server-initiated push.
- Every request is authenticated, origin-checked, and scope-checked before the SDK handler ever
  sees it — see "OAuth 2.1 (MCP Clients)" below and `THREAT-MODEL.md`'s "Hosted connector callbacks"
  section for the exact order of checks.

### Per-user handler instances and resource update delivery

`PROTO-002` gives each authenticated user their own `McpHttpHandler` instance
(`McpUserHandlerCache`, idle-evicted after a bounded interval), not one shared handler for the
whole process. This is what makes `subscriptions/listen` — the `2026-07-28` push-notification
mechanism — safe to serve at all: the SDK's `ServerEventBus` filters purely by resource URI with no
notion of caller identity, so a shared handler would let user A's `user://profile` update reach user
B's open listen stream the moment B names the same literal (fixed, "my own profile") URI. Giving
each user their own handler and Redis-backed event bus (`mcp-user-event-bus.ts`) confines a
published update to that user's own channel structurally, not via a runtime filter that could be
gotten wrong.

## OAuth 2.1 Flow

### Client Identity: Dynamic Registration or Client ID Metadata Documents

`POST /oauth/register` (RFC 7591 dynamic client registration, DCR) accepts a JSON body with
`client_name`, `redirect_uris`, `grant_types`, `response_types`, `token_endpoint_auth_method`, and
optionally `application_type` (SEP-837 -- never defaulted; a client that declares `web` is held to an
HTTPS-only redirect URI, one that omits it keeps the pre-existing loopback-friendly behavior every
current connector relies on). Only `authorization_code` and `refresh_token` are supported grant
types. Confidential clients (`token_endpoint_auth_method: "client_secret_post"`) get a `client_id`
(UUID) and a `client_secret` (random 32 bytes, hex-encoded, SHA-256 hashed before storage, with an
expiration timestamp `DATA-001` added). Public clients (`token_endpoint_auth_method: "none"`) get no
secret at all -- the response omits `client_secret` entirely rather than returning one -- and, unlike
an earlier version of this server, are **not** restricted from the `refresh_token` grant; a public
client rotates refresh tokens the same way a confidential one does.

The authorization server also advertises `client_id_metadata_document_supported: true`
(`OAUTH-002`): a client may instead use an HTTPS URL it controls directly as its `client_id`. On
each authorization request naming such a URL, the server fetches, validates (SSRF-guarded --
loopback/RFC 1918/link-local/cloud-metadata address ranges blocked for both literal-IP and
DNS-rebinding cases, `redirect: 'error'`, bounded size and timeout), and upserts the document into
`oauth_clients`. A Client ID Metadata Document is restricted to `token_endpoint_auth_method: "none"`
only -- there is no verified mechanism here for a shared secret or `private_key_jwt` against a
document anyone can read.

### Authorization Code + PKCE

1. The client redirects the user to `GET /oauth/authorize` with `client_id`, `redirect_uri`,
   `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `resource` (RFC 8707 -- must
   exactly match this server's canonical `${BASE_URL}/mcp`), an optional `scope` (defaults to every
   scope this server's tool/resource/prompt registry supports when omitted), and `state`.
2. If the user is not signed in, they are redirected to Google sign-in first.
3. After validating the client, redirect URI, resource, and scope, the server creates a short-lived, single-use authorization transaction (`oauth_authorization_transactions`) binding the authenticated session, user, client, redirect URI, PKCE challenge, resource, scope, state, and the canonical issuer identifier server-side, and returns only an opaque `transaction_id` and one-time `csrf_token` to the browser. The consent page (server-rendered Svelte, no client-side JavaScript) shows the client name, the human-readable description of each scope being granted, and an approve/deny form whose hidden fields carry only those two opaque values -- never the client, redirect, PKCE, resource, or scope data itself, so editing them client-side cannot change what was reviewed.
4. On approval, `POST /oauth/authorize/approve` validates the request's `Sec-Fetch-Site`/`Origin` header, then atomically consumes the transaction in one `UPDATE ... WHERE ... RETURNING` (rejecting a missing, mismatched, expired, already-consumed, cross-session, or cross-user transaction with no code issued). A 32-byte authorization code is then generated, hashed, and stored in `oauth_codes` with a 10-minute expiration, using only the transaction's stored values.
5. The user is redirected back to the client's `redirect_uri` (from the transaction, not the form) with the plaintext code, state, and, per RFC 9207, `iss` -- the canonical issuer identifier this authorization was issued under, which a client should verify before redeeming the code.
6. The client exchanges the code at `POST /oauth/token` with the `code_verifier` and the same `resource` value. The server verifies the PKCE challenge (`SHA-256(code_verifier) == stored code_challenge`) using constant-time comparison and rejects a `resource` mismatch with `invalid_target`.
7. On success, an access token (`MCP_TOKEN_TTL_SECONDS`, 1 hour default) and refresh token (`MCP_REFRESH_TOKEN_TTL_SECONDS`, 30 days default) are issued, both bound to the requested resource and scope. A token whose bound resource no longer matches the one presented to `/mcp` is rejected there as `invalid_token`, and an under-scoped tool call is rejected at the MCP boundary (see "Scope enforcement" below), not just at authorize time.

### Token Refresh with Rotation

When a client presents a refresh token at `POST /oauth/token` with `grant_type=refresh_token`:

1. The existing refresh token is immediately revoked (single-use).
2. The associated access token is revoked.
3. A new access token and a new refresh token are issued, both public and confidential clients alike.

This rotation pattern ensures that a compromised refresh token can only be used once. If both the legitimate client and an attacker try to use the same refresh token, the second attempt is rejected with `invalid_grant` and logged as a `refresh_replay` outcome (see `RUNBOOK.md`) -- a signal worth investigating on its own, not just counting.

### Token Revocation

`POST /oauth/revoke` accepts a token and optional `token_type_hint`, and -- as of `OAUTH-003` --
authenticates the calling client first, so one client cannot revoke a token that belongs to a
different client. It revokes the matching access or refresh token (and its paired access token if
revoking a refresh token) atomically. Per RFC 7009, it returns 200 even if the token was not found,
so a caller cannot use the revoke endpoint's response to probe for valid tokens.

### Scope enforcement

`AUTHZ-001`'s scope vocabulary (`profile:read`, `audit:read` -- conformance-only, never advertised in
production, `prompts:read`) is enforced per tool/resource/prompt invocation, not only at authorize
time. Every registered primitive declares a `requiredScope`; an under-scoped call returns
`isError: true` with `_meta['mcp/www_authenticate']` naming the missing scope (tools) or throws a
JSON-RPC `-32003` error carrying the same challenge (resources/prompts) before the handler ever
runs. `tools/list` itself is unaffected by scope -- an under-scoped tool still appears in the
listing, the same way host applications expect discovery to work.

## Rate Limiting

A sliding window rate limiter backed by Redis sorted sets protects sensitive endpoints from abuse. The implementation uses `ZREMRANGEBYSCORE` to expire old entries, `ZCARD` to count requests in the window, and `ZADD` to record new requests, with a finite-value guard (`SEC-003`/`BUG-001`) so a misconfigured window or maximum fails loudly rather than serializing `NaN`/`Infinity` into Redis. Production refuses to start without Redis configured -- an in-memory fallback exists for local development only, since it is per-process and would let a multi-instance deployment be trivially over-admitted.

| Endpoint                                            | Key                                               | Default Limit             |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------- |
| `POST /oauth/register`                              | Network identity (trusted-proxy-aware; see below) | 10 requests / 60 seconds  |
| `POST /oauth/authorize`                             | Network identity                                  | 30 requests / 60 seconds  |
| `POST /oauth/token`                                 | Network identity                                  | 30 requests / 60 seconds  |
| `POST /oauth/revoke`                                | Network identity                                  | 30 requests / 60 seconds  |
| `GET`/`POST /auth/google/*`                         | Network identity                                  | 20 requests / 60 seconds  |
| `POST /auth/sign-out`, account connections          | Network identity                                  | 10 requests / 60 seconds  |
| `POST`/`GET`/`DELETE /mcp`                          | Authenticated `userId`                            | 60 requests / 60 seconds  |
| `POST`/`GET`/`DELETE /mcp` (concurrent)             | Authenticated `userId`                            | 10 concurrent requests    |
| `GET /health/ready`, `GET /metrics`                 | Network identity                                  | 60 / 30 requests / 60 sec |
| Repeated authentication failures (any of the above) | Network identity                                  | 10 failures / 300 seconds |

Every limit above is a real, named environment variable (`RATE_LIMIT_<SURFACE>_MAX` /
`RATE_LIMIT_<SURFACE>_WINDOW_SECONDS` -- see `.env.example` for the exhaustive, current list) -- this
table is a representative summary, not the authoritative source. "Network identity" is derived by
`request-client-identifier.ts`: the raw socket address, unless the immediate peer is itself inside a
configured `TRUSTED_PROXY_CIDRS` range, in which case the configured `TRUSTED_PROXY_HEADER`
(`X-Forwarded-For`, `Forwarded`, or `CF-Connecting-IP`) is trusted instead -- an unconfigured
deployment cannot have its rate limiting bypassed by a forged header. When a request is
rate-limited, the server returns **429 Too Many Requests** with a `Retry-After` header calculated
from the oldest entry in the window.

## Key Design Decisions

### Cookie sessions over JWT for revocability

User sessions store a SHA-256 hash of a random token in the database. Revoking a session takes effect immediately on the next request. JWTs would require either short expiration times (poor user experience) or a token blocklist (which reintroduces server-side state without the simplicity of a session table). The cookie approach also avoids exposing user claims to client-side JavaScript.

### Shared Redis rate limiting over per-instance state

The MCP transport itself is stateless (owned by the official SDK — no session identifiers, no server-side transport registry to pin a client to one instance), so a multi-instance deployment needs no sticky routing at all. What does need to be shared across instances is abuse control: rate limits, concurrency caps, and failed-authentication lockouts are backed by one atomic Redis-backed sliding window rather than per-process counters, so the limit is enforced correctly no matter which instance a request lands on. Production refuses to start without Redis configured for exactly this reason (`startup-invariants.ts`) — an in-memory fallback exists for local development, but it is per-process and would let a multi-instance deployment be trivially over-admitted.

### Bun runtime for performance and simplified toolchain

Bun provides a built-in HTTP server, native TypeScript execution, a test runner, and a package manager in a single binary. There is no need for a separate bundler, transpiler, or process manager. The `Bun.serve` API supports static file preloading, direct `Request`/`Response` handling, and `requestIP` for rate limiting, which removes the need for middleware frameworks.

### Server-rendered Svelte, with client-side JavaScript deliberately excluded from the OAuth consent page

The OAuth consent screen (`applications/web/src/views/oauth-authorize-page.svelte`) is rendered via
`renderStaticDocument`/`createStaticHtmlResponse`, which never includes the client bundle — it is a
plain form that submits via standard POST requests and redirects, and must not be manipulable by
client-side scripts. The home page (`applications/web/src/components/home-page.svelte`) is rendered
via `createStreamingHtmlResponse` and does include a small client bundle
(`applications/web/src/client/entry.ts`) for genuinely client-only affordances like Cinder's
copy-to-clipboard button — there is no client-side router or global state management, and no route
depends on JavaScript to function. The distinction is deliberate per page, not an inconsistency:
security-sensitive pages get no client bundle at all; ordinary pages get the minimum client-side
behavior an actual affordance needs.

Svelte has no streaming renderer — `svelte/server` exports only a synchronous `render()` — so
"streaming" here means the document is flushed shell-first: `createStreamingHtmlResponse` writes the
`<head>` and opening `<body>` immediately, _before_ the page's data callback runs, so the browser
begins fetching the stylesheet while the server is still querying. The rendered body then arrives in
a single chunk. A consequence of flushing the head first is that `render().head` can never be
delivered, so both response helpers assert it is empty and throw otherwise — which also catches a
component that tried to inject styles.

Component CSS is collected by bundling `applications/web/src/styles/style-entry.ts`, a module whose
only job is to import every page component so the bundler walks into the Cinder components those
pages render and picks up the stylesheet shipped beside each one. Neither the server build (which
resolves Cinder through its CSS-free `node` entry) nor the client bundle (which contains only the
pages that hydrate) can do that collection alone, and the pages that ship no JavaScript need their
styles all the same. `style-entry.test.ts` fails if a page component is missing from that module.

### Separate MCP package for reusability

The `packages/mcp` package contains all tool, resource, and prompt definitions along with the `createMcpServer` factory. This package has no dependency on the web application, HTTP transport, or authentication layer. It can be reused with a different transport (stdio, WebSocket) or a different web framework without modification.
