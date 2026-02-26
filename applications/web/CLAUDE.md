# @template/web

SvelteKit application — UI, OAuth endpoints, and MCP server transport.

## Key Areas

- `src/hooks.server.ts` — Dual auth: Bearer token for `/mcp`, Neon Auth session for everything else.
- `src/lib/authentication.ts` — Better Auth server instance configured with Neon Auth.
- `src/lib/mcp-handler.ts` — In-memory transport Map, session management, MCP request handling.
- `src/routes/mcp/+server.ts` — GET/POST/DELETE handlers for Streamable HTTP transport.
- `src/routes/authorize/` — OAuth approval UI (requires Neon Auth session).
- `src/routes/token/+server.ts` — Code→token exchange with PKCE validation.
- `src/routes/register/+server.ts` — Dynamic client registration (RFC 7591).
- `src/routes/.well-known/oauth-authorization-server/+server.ts` — OAuth metadata.

## Patterns

- Use `adapter-node` (Railway deployment), not `adapter-vercel`.
- Environment variables via `src/env.ts`, never `$env/*` or `process.env`.
- `experimental.async` is enabled in `svelte.config.js` under `compilerOptions.experimental`.
- The MCP transport Map is in-memory — sessions are lost on redeploy. Database tracks session metadata for reconnection.

## Testing

- Use `vitest` (not `bun test`) for this application.
- Component tests: `*.svelte.test.ts` — Server tests: `*.ssr.test.ts`
