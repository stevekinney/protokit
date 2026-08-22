# Skill: OAuth Flow

Reference for the OAuth 2.1 + PKCE authorization-code flow this template implements for MCP
clients (Claude hosted connectors, Claude Code, Codex CLI/desktop, ChatGPT). See `THREAT-MODEL.md`
for the security reasoning behind each control named below, `CONNECTORS.md` for exact per-client
setup/removal commands, and `applications/web/src/routes/oauth-routes.tsx` for the implementation.

## Endpoints

All under `/oauth/*` — not the bare `/register`, `/authorize`, `/token` paths some generic OAuth
references use:

- `GET /.well-known/oauth-authorization-server` — RFC 8414 authorization server metadata
- `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` — RFC
  9728 protected-resource metadata (the second is the MCP-specific one carrying
  `mcp_protocol_version`)
- `POST /oauth/register` — RFC 7591 dynamic client registration (DCR)
- `GET /oauth/authorize`, `POST /oauth/authorize/approve`, `POST /oauth/authorize/deny` — the
  consent flow
- `POST /oauth/token` — code exchange and refresh grants
- `POST /oauth/revoke` — RFC 7009 revocation

## Flow

1. **Discovery**: the client fetches the three metadata documents above.
2. **Client identity**: either RFC 7591 dynamic registration (`POST /oauth/register`) or a Client
   ID Metadata Document (CIMD) — an HTTPS URL used directly as `client_id`, fetched, validated
   (SSRF-guarded), and upserted into `oauth_clients` on every authorization request that names it.
   The authorization server metadata advertises `client_id_metadata_document_supported: true` so a
   CIMD-aware client (per the MCP spec's "Advertising CIMD Support" section) prefers it over DCR.
   Confidential clients (`token_endpoint_auth_method: client_secret_post`) and public clients
   (`token_endpoint_auth_method: none`) are both supported; a CIMD document is restricted to `none`
   only, because there is no verified mechanism here for a shared secret or `private_key_jwt`
   against a document anyone can read.
3. **Authorization**: the client redirects the user to
   `GET /oauth/authorize?client_id=...&redirect_uri=...&response_type=code&code_challenge=...&code_challenge_method=S256&resource=...&scope=...&state=...`.
   `code_challenge_method=S256` is the only method accepted — `plain` is rejected. `resource` (RFC 8707) must exactly match this server's canonical `${BASE_URL}/mcp` value or the request is
   rejected; the resulting token is bound to that resource and rejected at `/mcp` if presented
   against a different one. `scope` is optional and, if omitted, defaults to every scope this
   server's registry supports (`getSupportedScopes()` — see `packages/mcp/src/scopes.ts`).
4. **User approval**: the user must have an authenticated session (Google sign-in in production;
   `GET /auth/dev/login` outside production only, and never when a tunnel is active — see
   `CONFIG-001` in `THREAT-MODEL.md`). Approval and denial are server-side atomic
   transactions (`authorization-transaction.ts`), not a client-editable form — the browser only ever
   carries an opaque `transaction_id` and one-time `csrf_token`, never the client, redirect, PKCE,
   resource, or scope values themselves.
5. **Code redirect**: the server redirects to `redirect_uri` with `code`, `state`, and, per RFC
   9207, `iss` (this server's canonical issuer) — a client should verify `iss` matches what it
   expects before redeeming the code.
6. **Token exchange**: `POST /oauth/token` with
   `grant_type=authorization_code&code=...&redirect_uri=...&client_id=...&code_verifier=...&resource=...`
   (form-encoded; the server also accepts JSON — check `Content-Type` and handle both, matching what
   the route already does). `resource` must match the value bound at authorize time.
7. **PKCE validation**: the server verifies `SHA256(code_verifier) === stored_code_challenge`
   (base64url) in constant time.
8. **Tokens issued**: an access token (`MCP_TOKEN_TTL_SECONDS`, default 3600s) and, for both
   confidential and public clients, a refresh token (`MCP_REFRESH_TOKEN_TTL_SECONDS`, default
   2,592,000s / 30 days) — public clients are not restricted from the refresh-token grant.

## Refresh and revocation

- **Refresh rotates**: `POST /oauth/token` with `grant_type=refresh_token` revokes the presented
  refresh token and its paired access token, then issues a new pair — single-use, client-bound. A
  replayed (already-rotated) refresh token is rejected with `invalid_grant` and logged as
  `event: "oauth_token_exchange"` / `outcome: "refresh_replay"` (see `RUNBOOK.md`).
- **Revocation is client-bound and atomic** (`OAUTH-003`): `POST /oauth/revoke` authenticates the
  calling client before revoking, so one client cannot revoke another client's token. Revoking a
  refresh token also revokes its paired access token. Every credential-shaped database column
  (`oauth_tokens.accessTokenHash`, `oauth_refresh_tokens`, session tokens) stores only a SHA-256
  hash — never the plaintext value — and revocation sets `revokedAt`, checked on every subsequent
  lookup. Per RFC 7009 §2.2, the endpoint returns `200` whether or not the token existed, so a
  caller cannot probe for valid tokens through the revoke endpoint's response.

## Scopes

`AUTHZ-001`'s scope vocabulary (`profile:read`, `audit:read`, `prompts:read` — the last of these
never advertised outside conformance mode) is enforced per tool/resource/prompt invocation, not
just at authorize time. An under-scoped call gets `isError: true` with
`_meta['mcp/www_authenticate']` naming the missing scope, without the handler ever running. See
`packages/mcp/CLAUDE.md`'s `requiredScope` documentation and `THREAT-MODEL.md`.

## Metadata and legal links

Protected-resource metadata carries RFC 9728's `resource_name`, `resource_documentation`,
`resource_policy_uri`, and `resource_tos_uri`; authorization server metadata carries RFC 8414's
`service_documentation`, `op_policy_uri`, and `op_tos_uri`. All of them point at this server's own
`/privacy`, `/terms`, and `/support` pages via the canonical `BASE_URL`, never a hardcoded or
placeholder domain — see `applications/web/src/routes/oauth-routes.tsx` and `CONNECTORS.md`.
