# @template/web

Bun-native Svelte 5 SSR application — UI, OAuth endpoints, and MCP server transport.

## Key Areas

- `src/server.ts` — Bun server entrypoint
- `src/application.ts` — Route dispatch, session hydration, OAuth + MCP HTTP handlers
- `src/lib/session-authentication.ts` — Custom cookie sessions backed by `user_sessions`
- `src/lib/google-authentication.ts` — Google OAuth redirect/callback state handling and profile fetch
- `src/lib/mcp-handler.ts` — MCP transport handling; hands validated requests to the official SDK, which owns the transport statelessly (no session affinity/ownership tracking)
- `src/views/` — Server-only components (async, database access, env reads). Never included in client bundle.
- `src/components/` — Shared/client components. Must be isomorphic — no server-only imports. Receive all data via props.
- `src/client/` — Client-only code (entry point, hydration bootstrap, page registry).
- `src/types/` — Shared type definitions used across server and client boundaries.
- `src/styles/application.css` — App-level layout, written in Cinder tokens
- `src/styles/style-entry.ts` — Imports every page component so the bundler collects their Cinder CSS. Add new pages here; `style-entry.test.ts` enforces it.
- `src/svelte-preload.ts` — Registers the Svelte compiler with the Bun runtime loader (wired up by `bunfig.toml`)

## Rendering Modes

Two rendering paths coexist for security:

- **Streaming (interactive pages)**: shell-first flush + `hydrate()` — used for pages that need client interactivity (homepage, dashboards).
- **Static (security-critical pages)**: one-shot `render()` with no client bundle + `script-src 'none'` — used for OAuth consent and error pages where zero client JavaScript is required.

Use `createStreamingHtmlResponse` for interactive pages and `createStaticHtmlResponse` for script-free pages. Both take `component` and props rather than pre-rendered markup.

`createStreamingHtmlResponse` takes a `resolvePage` callback and flushes the document head _before_ calling it, so keep per-page data fetching inside that callback — hoisting it out silently gives up the early flush. Svelte has no streaming renderer, so the body itself is one chunk.

Components must not use `<style>` blocks or `<svelte:head>`. The compiler runs with `css: 'none'` (the zero-JavaScript pages have no way to load component-emitted CSS), and the head is built from `DocumentMetadata` before the body renders. Both response helpers throw if a component emits head content. Style with Cinder components, Cinder tokens, and the classes in `application.css`.

## Client Hydration

- The client bundle entry is `src/client/entry.ts`, built by `Bun.build({ target: 'browser' })` and hydrated with `hydrate()` from `svelte` (never `mount()`, which would discard the server-rendered DOM).
- Server data reaches the client via `<script id="__SERVER_DATA__" type="application/json">` — route handlers explicitly choose what to serialize (no session tokens or internal IDs).
- `src/client/page-registry.ts` maps page name strings to component modules. Add new pages here.
- The object a route puts in `serverData` is used as BOTH the server render props and the client hydration props. Keep it that way — one object is what makes a hydration mismatch structurally impossible.
- The `src/components/` directory enforces the server/client boundary architecturally: Bun's browser build will fail if any component transitively imports server-only modules.

## Patterns

- Prefer a `@lostgradient/cinder` component over a bespoke one; compose from Cinder before writing new markup
- Environment variables via `src/env.ts`, never direct `process.env` reads outside env file
- OAuth app routes live under `/oauth/*`
- MCP endpoint remains `/mcp` with strict protocol/version/origin checks

## Testing

- Use `bun:test` for all tests in this application
- Prefer request-level integration tests that boot the Bun server for HTTP contract coverage
