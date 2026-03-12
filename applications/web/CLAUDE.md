# @template/web

Bun-native React SSR application — UI, OAuth endpoints, and MCP server transport.

## Key Areas

- `src/server.ts` — Bun server entrypoint
- `src/application.tsx` — Route dispatch, session hydration, OAuth + MCP HTTP handlers
- `src/lib/session-authentication.ts` — Custom cookie sessions backed by `user_sessions`
- `src/lib/google-authentication.ts` — Google OAuth redirect/callback state handling and profile fetch
- `src/lib/mcp-handler.ts` — MCP transport handling with Redis-backed ownership and affinity validation
- `src/views/` — Server-rendered React pages
- `src/styles/application.css` — Tailwind v4 stylesheet source

## Patterns

- Runtime: Bun server + React `renderToStaticMarkup` (no SPA hydration by default)
- Environment variables via `src/env.ts`, never direct `process.env` reads outside env file
- OAuth app routes live under `/oauth/*`
- MCP endpoint remains `/mcp` with strict protocol/version/origin checks

## Testing

- Use `bun:test` for all tests in this application
- Prefer request-level integration tests that boot the Bun server for HTTP contract coverage
