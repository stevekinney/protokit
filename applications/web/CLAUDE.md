# @template/web

Bun-native React SSR application — UI, OAuth endpoints, and MCP server transport.

## Key Areas

- `src/server.ts` — Bun server entrypoint
- `src/application.tsx` — Route dispatch, session hydration, OAuth + MCP HTTP handlers
- `src/lib/session-authentication.ts` — Custom cookie sessions backed by `user_sessions`
- `src/lib/google-authentication.ts` — Google OAuth redirect/callback state handling and profile fetch
- `src/lib/mcp-handler.ts` — MCP transport handling with Redis-backed ownership and affinity validation
- `src/views/` — Server-only components (async, database access, env reads). Never included in client bundle.
- `src/components/` — Shared/client components. Must be isomorphic — no server-only imports. Receive all data via props.
- `src/client/` — Client-only code (entry point, hydration bootstrap, page registry).
- `src/types/` — Shared type definitions used across server and client boundaries.
- `src/styles/application.css` — Tailwind v4 stylesheet source

## Rendering Modes

Two rendering paths coexist for security:

- **Streaming (interactive pages)**: `renderToReadableStream` + `hydrateRoot` + `script-src 'self'` — used for pages that need client interactivity (homepage, dashboards).
- **Static (security-critical pages)**: `renderToStaticMarkup` + `script-src 'none'` — used for OAuth consent and error pages where zero client JavaScript is required.

Use `createStreamingHtmlResponse` for interactive pages and `createStaticHtmlResponse` for script-free pages.

## Client Hydration

- The client bundle entry is `src/client/entry.tsx`, built by `Bun.build({ target: 'browser' })`.
- Server data reaches the client via `<script id="__SERVER_DATA__" type="application/json">` — route handlers explicitly choose what to serialize (no session tokens or internal IDs).
- `src/client/page-registry.ts` maps page name strings to component modules. Add new pages here.
- The `src/components/` directory enforces the server/client boundary architecturally: Bun's browser build will fail if any component transitively imports server-only modules.

## Patterns

- Environment variables via `src/env.ts`, never direct `process.env` reads outside env file
- OAuth app routes live under `/oauth/*`
- MCP endpoint remains `/mcp` with strict protocol/version/origin checks

## Testing

- Use `bun:test` for all tests in this application
- Prefer request-level integration tests that boot the Bun server for HTTP contract coverage
