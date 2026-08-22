# Skill: Debug MCP

Debug the MCP server using a Cloudflare tunnel and MCP Inspector.

## Workflow

1. Start the tunnel with `bun scripts/develop.ts --tunnel` (or the `tunnel` slash command) — never
   `bunx cloudflared tunnel` against an already-running dev server. `CONFIG-001`: a dev server not
   started with `PROTOKIT_TUNNEL_ACTIVE` set still serves `GET /auth/dev/login` (the unauthenticated
   development login bypass) and conformance fixtures; `scripts/develop.ts --tunnel` starts its own
   dev server with that flag set specifically to disable both for the duration of the tunnel.
2. Copy the printed tunnel URL (e.g. `https://random-name.trycloudflare.com`); the MCP endpoint is
   that URL plus `/mcp`.
3. Open MCP Inspector: `bunx @modelcontextprotocol/inspector@2.3.0` (pinned in the root
   `package.json`'s `devDependencies` — run `bunx` without a version only if you've confirmed it
   still resolves to a compatible release).
4. In the inspector, connect using the tunnel's `/mcp` URL.
5. Test the OAuth flow: registration or CIMD → authorize → token. See `oauth-flow` (this skill
   directory's sibling) for the exact endpoints and grant shapes, and `CONNECTORS.md` for the same
   flow driven by a real client CLI instead of the Inspector.
6. Call tools and verify responses, including a deliberately under-scoped call to confirm the
   `insufficient_scope` rejection (`AUTHZ-001`) behaves as documented.

## Common Issues

- **401 Unauthorized**: check that the Bearer token is valid, not expired, and bound to the
  `resource` (RFC 8707) this server advertises — a token minted against a different resource is
  rejected with the same `401` shape as an expired token; the log line's `event`/`outcome` fields
  (see `RUNBOOK.md`) distinguish which one actually happened, since the wire response deliberately
  does not.
- **PKCE validation failed**: ensure `code_verifier` and `code_challenge` match using `S256` —
  `plain` is never accepted.
- **Well-known metadata mismatch**: verify the URLs in `/.well-known/oauth-authorization-server`,
  `/.well-known/oauth-protected-resource`, and `/.well-known/oauth-protected-resource/mcp` all agree
  on one canonical origin, derived from `BASE_URL`, never a request's `Host` header.
- **403 from `/mcp` before any auth check runs**: this server validates the request's `Origin`
  (cross-site allow-list) and, for a loopback-bound request, DNS-rebinding protection, before it
  ever reads a bearer token — see the "Hosted connector callbacks" section of `THREAT-MODEL.md`. A
  403 here means the request never reached authentication at all; check `MCP_ALLOWED_ORIGINS` and
  the `Origin`/`Host` headers the client actually sent before assuming the token is the problem.
- **429 Too Many Requests**: every OAuth and `/mcp` route is rate-limited (`SEC-003`); the response
  carries a `Retry-After` header computed from the sliding window. Not a bug — back off and retry.

This server's MCP transport is the official SDK's own stateless Streamable HTTP implementation
(`PROTO-001`) — there is no server-side session-affinity map, `mcp-session-id` header, or "session
lost on restart" failure mode to debug; every request stands alone.

## Checking Logs

The MCP server logs via pino. In development, logs are pretty-printed to stdout via `pino-pretty`;
in production they are structured JSON. Search on the `event` and `outcome` fields documented in
`RUNBOOK.md` — never on a token, code, or secret value, since the logger redacts those by design.
`requestId` ties one connector action's log lines together end to end, from the HTTP boundary
through OAuth validation into every tool/resource/prompt handler.
