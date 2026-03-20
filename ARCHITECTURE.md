# Architecture

## Overview

This template provides a production-ready remote MCP (Model Context Protocol) server with OAuth 2.1 authentication. It is built on Bun, server-rendered React, Neon Postgres (via Drizzle ORM), and Redis. The system supports multi-instance deployments with session affinity, sliding-window rate limiting, and optional enterprise authorization policy evaluation.

## Monorepo Layout

| Package             | Responsibility                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applications/web`  | Bun-native HTTP server, React SSR views, OAuth 2.1 endpoints, MCP transport layer, cookie session management                                                                                                        |
| `packages/database` | Drizzle ORM schema (`users`, `user_sessions`, `user_google_accounts`, `oauth_clients`, `oauth_codes`, `oauth_tokens`, `oauth_refresh_tokens`, `mcp_sessions`), migrations, shared database client for Neon Postgres |
| `packages/mcp`      | MCP server factory (`createMcpServer`), tool/resource/prompt definitions, server instructions, shared pino logger                                                                                                   |

## Request Flow

Every HTTP request passes through three layers:

1. **`server.ts`** -- Bun's built-in `Bun.serve` entrypoint. Serves pre-resolved static files (favicon, CSS, robots.txt) via Bun's `static` option. All other requests are forwarded to `handleApplicationRequest`.

2. **`application.tsx`** -- The application layer. Each request gets:
   - A unique request ID (`X-Request-Id` header).
   - Static file resolution for anything under `/assets/`.
   - Session hydration: the cookie is read, the token is hashed, and the `user_sessions` table is queried to build a `RequestContext` containing the authenticated user (or `null`).
   - Dispatch to the matching route handler based on pathname and HTTP method.
   - Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`, `X-Frame-Options` on `/oauth/authorize`).
   - Structured request logging (method, path, status, duration, user ID).

3. **Route handlers** -- Plain functions that receive a `RequestContext` and return a `Response`. There is no framework router; dispatch is a sequential `if` chain in `application.tsx`.

```
Bun.serve (server.ts)
	-> static file? return cached Response
	-> handleApplicationRequest (application.tsx)
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

The MCP server uses Streamable HTTP with SSE (Server-Sent Events), implemented via `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk`.

- **POST /mcp** -- Sends JSON-RPC messages. The response is either a single JSON object or an SSE stream, depending on whether the request is a notification or expects a reply. The `Accept` header must include both `application/json` and `text/event-stream`.
- **GET /mcp** -- Opens a persistent SSE stream for server-initiated messages (notifications, progress updates). Requires `Accept: text/event-stream`.
- **DELETE /mcp** -- Closes the session and cleans up the transport.

Session initialization happens when a POST contains an `initialize` JSON-RPC message with no `mcp-session-id` header. The server creates a new `WebStandardStreamableHTTPServerTransport`, assigns a UUID session ID, registers it in Redis and the `mcp_sessions` database table, and returns the session ID in the response.

Subsequent requests include the `mcp-session-id` header. The server verifies the session exists in Redis, belongs to the requesting user, and is owned by this application instance before forwarding the request to the transport.

### Stateless Fallback

If a POST arrives without an `mcp-session-id` header and is not an initialization request, the server creates an ephemeral transport, processes the single request, and tears it down. This supports one-shot tool calls without establishing a persistent session.

## OAuth 2.1 Flow

### Dynamic Client Registration

`POST /oauth/register` accepts a JSON body with `client_name`, `redirect_uris`, `grant_types`, `response_types`, and `token_endpoint_auth_method`. The server generates a `client_id` (UUID) and `client_secret` (random 32 bytes, hex-encoded). The secret is SHA-256 hashed before storage. Public clients use `token_endpoint_auth_method: "none"` and are restricted from `refresh_token` and `client_credentials` grants.

### Authorization Code + PKCE

1. The client redirects the user to `GET /oauth/authorize` with `client_id`, `redirect_uri`, `response_type=code`, `code_challenge`, and `code_challenge_method=S256`.
2. If the user is not signed in, they are redirected to Google sign-in first.
3. The consent page (server-rendered React) shows the client name and an approve/deny form.
4. On approval, a 32-byte authorization code is generated, hashed, and stored in `oauth_codes` with a 10-minute expiration.
5. The user is redirected back to the client's `redirect_uri` with the plaintext code and state.
6. The client exchanges the code at `POST /oauth/token` with the `code_verifier`. The server verifies the PKCE challenge (`SHA-256(code_verifier) == stored code_challenge`) using constant-time comparison.
7. On success, an access token (1 hour default) and refresh token (30 days default) are issued.

### Token Refresh with Rotation

When a client presents a refresh token at `POST /oauth/token` with `grant_type=refresh_token`:

1. The existing refresh token is immediately revoked (single-use).
2. The associated access token is revoked.
3. A new access token and a new refresh token are issued.

This rotation pattern ensures that a compromised refresh token can only be used once. If both the legitimate client and an attacker try to use the same refresh token, the second attempt fails and signals a breach.

### Client Credentials Grant

When `MCP_ENABLE_CLIENT_CREDENTIALS` is enabled, machine-to-machine clients can authenticate directly with `client_id` and `client_secret` at `POST /oauth/token` with `grant_type=client_credentials`. A service account user is created during client registration and linked via `service_account_user_id`. No refresh token is issued for this grant type.

### Token Revocation

`POST /oauth/revoke` accepts a token and optional `token_type_hint`. It revokes the matching access or refresh token (and its paired access token if revoking a refresh token). Per RFC 7009, it returns 200 even if the token was not found.

## Session Affinity

MCP sessions are stateful: each session has an in-memory `WebStandardStreamableHTTPServerTransport` instance that maintains the JSON-RPC connection state and any open SSE streams. In a multi-instance deployment behind a load balancer, a request must reach the same server instance that created the session.

Redis stores session-to-instance mappings. Each record contains:

- `sessionId` -- The MCP session UUID.
- `userId` -- The owning user.
- `ownerInstanceId` -- The identifier of the server instance that created the session.
- `lastActivityAt` and `expiresAt` -- For TTL-based expiration.

The instance identifier is resolved from `INSTANCE_IDENTIFIER`, `RAILWAY_REPLICA_ID`, `HOSTNAME`, or a random UUID (in that priority order).

When a request arrives with an `mcp-session-id`:

1. The session is looked up in Redis.
2. If the `ownerInstanceId` does not match the current instance, the server returns **409 Conflict** with `"action": "reconnect"`. The client should discard the session and initialize a new one, which will be routed to whichever instance handles the initialization request.

This approach works across cloud providers without requiring provider-specific sticky session configuration at the load balancer level.

Idle sessions are evicted from the in-memory transport map after 30 minutes. A periodic interval (every 5 minutes) sweeps for idle entries.

## Rate Limiting

A sliding window rate limiter backed by Redis sorted sets protects sensitive endpoints from abuse. The implementation uses `ZREMRANGEBYSCORE` to expire old entries, `ZCARD` to count requests in the window, and `ZADD` to record new requests.

| Endpoint                      | Key                                          | Default Limit            |
| ----------------------------- | -------------------------------------------- | ------------------------ |
| `POST /oauth/register`        | Client IP or forwarded address               | 10 requests / 60 seconds |
| `POST /oauth/token`           | Client IP (optionally scoped to `client_id`) | 30 requests / 60 seconds |
| `POST /mcp` (and GET, DELETE) | Authenticated `userId`                       | 60 requests / 60 seconds |

All limits are configurable via environment variables. When a request is rate-limited, the server returns **429 Too Many Requests** with a `Retry-After` header calculated from the oldest entry in the window.

## Enterprise Authorization

An optional policy evaluation layer gates token issuance and MCP access. When `MCP_ENABLE_ENTERPRISE_AUTH` is enabled, the system checks whether the requesting `client_id` appears in the `ENTERPRISE_AUTH_ALLOWED_CLIENT_IDS` allowlist before:

- Issuing tokens (authorization code exchange, refresh, and client credentials grants).
- Allowing access to the `/mcp` endpoint.

If the client is not in the allowlist, the request is rejected with a 403 status. The configuration accepts an external provider URL (`ENTERPRISE_AUTH_PROVIDER_URL`), tenant, audience, and credentials, which allows extending the policy evaluation to call an external authorization service.

## Key Design Decisions

### Cookie sessions over JWT for revocability

User sessions store a SHA-256 hash of a random token in the database. Revoking a session takes effect immediately on the next request. JWTs would require either short expiration times (poor user experience) or a token blocklist (which reintroduces server-side state without the simplicity of a session table). The cookie approach also avoids exposing user claims to client-side JavaScript.

### Redis for session affinity over sticky sessions at the load balancer

MCP transports are stateful and pinned to the server instance that created them. Rather than relying on provider-specific load balancer features (cookie-based sticky sessions, IP hashing), the server stores session ownership in Redis and returns a 409 when a request hits the wrong instance. This works identically across Railway, Fly, AWS, and any other provider. The client reconnects and the new session lands on whatever instance handles it.

### Bun runtime for performance and simplified toolchain

Bun provides a built-in HTTP server, native TypeScript execution, a test runner, and a package manager in a single binary. There is no need for a separate bundler, transpiler, or process manager. The `Bun.serve` API supports static file preloading, direct `Request`/`Response` handling, and `requestIP` for rate limiting, which removes the need for middleware frameworks.

### Server-rendered React over SPA

The web UI (home page, OAuth consent screen) uses `renderToStaticMarkup` with no client-side JavaScript hydration. These pages are simple forms that submit via standard POST requests and redirects. Server rendering eliminates the need for a client-side router, state management, or JavaScript bundles. This is particularly important for the OAuth consent page, which must not be manipulable by client-side scripts.

### Separate MCP package for reusability

The `packages/mcp` package contains all tool, resource, and prompt definitions along with the `createMcpServer` factory. This package has no dependency on the web application, HTTP transport, or authentication layer. It can be reused with a different transport (stdio, WebSocket) or a different web framework without modification.
