# @template/mcp

MCP server factory, tool/resource/prompt definitions, and shared logger.

## Key Files

- `src/server.ts` — `createMcpServer(context)` factory. Creates an McpServer instance, computes the server's advertised capabilities (only ones this server genuinely implements — see the comment above `buildServerCapabilities`), and auto-registers all tools, resources, and prompts from barrel files.
- `src/tools/index.ts` — Barrel file exporting individual tools. `allTools` is the _production_ registry (always registered); `conformanceOnlyTools` (currently just `list_audit_events`, which returns synthetic data) is registered only when `enableConformanceMode` is true — see `server.ts`. Never add a synthetic/demo-data tool to `allTools`.
- `src/resources/index.ts` — Barrel file exporting individual resources and `allResources` array.
- `src/prompts/index.ts` — Barrel file exporting individual prompts and `allPrompts` array.
- `src/types/primitives.ts` — `McpToolDefinition`/`defineTool`, `McpResourceDefinition`, `McpPromptDefinition`/`definePrompt`, `McpUserProfile`, `McpContext` types.
- `src/metadata-contract.test.ts` — the registry-wide contract test (`bun run test:metadata` from the repo root): every tool/resource/prompt has the required metadata, every `outputSchema` validates against its own tool's real output, and the server's wire capabilities advertise nothing this codebase does not actually implement.
- `src/tools/` — One file per tool, built with `defineTool(...)`. Each exports a tool object with `name`, `title`, `description`, `inputSchema`, optional `outputSchema`, `annotations`, and `handler`.
- `src/resources/` — One file per resource. Each exports a resource object with `name`, `title`, `uri`, `description`, `mimeType`, and `handler`.
- `src/prompts/` — One file per prompt, built with `definePrompt(...)`. Each exports a prompt object with `name`, `title`, `description`, `arguments`, and `handler`.
- `src/logger.ts` — Shared pino logger with `OBS-001`'s key- and value-based redaction. JSON in production; pretty-printed in development _only when `pino-pretty` actually resolves_. It is a devDependency and therefore absent from the production runtime image, so selecting the transport on `NODE_ENV` alone crashed the shipped container on any non-production run — the resolve check makes pretty output a convenience that degrades to JSON rather than a startup requirement.
- `src/env.ts` — Owns `MCP_SERVER_NAME`, `MCP_CONFORMANCE_MODE`, `LOG_LEVEL`, `NODE_ENV`, and `LOG_CONTENT_DIAGNOSTICS_UNTIL` (refused outright in production — see `OBS-001`'s note in `RUNBOOK.md`). The actual Zod shape lives in `src/environment-schema.ts`. Unlike `applications/web` and `packages/database`, this package does **not** use `@lostgradient/environmentalist` and does **not** read `process.env` when the module loads: importing any entry point of `@template/mcp` cannot throw, whatever the ambient environment. `env.ts` exports `parseMcpServerEnvironment(env)`, which takes the environment as an argument, and `getEnvironment()`, which lazily parses and memoizes `process.env` on first access. Both guards live inside the parse function rather than at module scope — the `SKIP_ENV_VALIDATION` rejection (`CONFIG-001`) and the production refusal of `LOG_CONTENT_DIAGNOSTICS_UNTIL` (`OBS-001`) — so they still fire, just when a caller asks rather than when a host imports. Consume it as `getEnvironment().MCP_SERVER_NAME`, `getEnvironment().NODE_ENV`, etc.: the keys are the schema's own `SCREAMING_SNAKE_CASE`, not Environmentalist's camel-cased aliases. The advertised server version comes from `src/version.ts`, a checked-in constant that survives bundling; `src/version.test.ts` fails if it drifts from `package.json`.
- `src/scopes.ts` / `src/supported-scopes.ts` — `AUTHZ-001`'s scope vocabulary: `mcpScopes` (`profile:read`, `audit:read`, `prompts:read`), `mcpScopeDescriptions` (consent-screen text per scope), and `getSupportedScopes()` — the sorted union of every _production_ tool/resource/prompt's `requiredScope`, deliberately excluding the conformance-only `audit:read` fixture. This one function backs every OAuth metadata document's `scopes_supported`, the authorize-time default/validator, the refresh-grant validator, and the `/mcp` 401 challenge's `scope` attribute — never hand-duplicate the list.
- `src/markdown.d.ts` — Type declarations for importing `.md` files as strings (used by prompt templates and server instructions). Always import with `with { type: 'text' }` — Bun's default `.md` loader renders Markdown to HTML, which is never what you want for text an LLM client reads as prose (confirmed empirically; see the comment above the `instructions.md` import in `server.ts`).
- `src/instructions.md` — Server instructions passed to the MCP client on initialize. The first ~500 characters must stand alone as a complete, meaningful description (purpose, capability families, authentication) — some clients only surface that much. Never contains placeholder/"customize this" text, checked by `content-boundaries.test.ts` and `bun run audit:production-content`.

## Adding a New Tool

1. Create `src/tools/my-tool-name.ts` (kebab-case filename)
2. Build it with `defineTool({ ... })` (from `../types/primitives.js`) rather than a bare object literal — it infers the input/output schema types for the handler and, because `title`, `description`, and `annotations` are required fields on `McpToolDefinition`, omitting any of them is a `tsc` error, not a silent gap.
3. Give it a snake_case `name` (e.g., `my_tool_name`, at most 64 characters), a concise `title`, and a "use this when…" `description`.
4. Define `inputSchema` with Zod. If the tool returns machine-readable data, also define `outputSchema` and return `structuredContent` matching it (see `createToolStructuredResponse` in `tool-response.ts`) — `structuredContent` is validated against `outputSchema` at call time. Tools with no structured result can omit `outputSchema` entirely.
5. Set all four `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) accurately — a tool can never claim both `destructiveHint: true` and `readOnlyHint: true` at once (`metadata-contract.test.ts` enforces this). Split read and write concerns into separate tools rather than one tool that does both.
   5a. Set `requiredScope` to one value from `mcpScopes` (`../scopes.js`) — `AUTHZ-001` checks it before every invocation and rejects an under-scoped call with `_meta['mcp/www_authenticate']` before the handler ever runs. Add a new scope value to `mcpScopes`/`mcpScopeDescriptions` only when the tool is a genuinely new capability family, not per tool.
6. `handler` takes `(input, context: McpContext)`. Tools must never throw — catch errors and return `{ content: [...], isError: true }`.
7. Log errors via `logger.error({ err }, 'description')`
8. Add the tool to `src/tools/index.ts`: import it and append to the `allTools` array — unless it returns synthetic/generated data purely to exercise a protocol behavior (like `list_audit_events`'s pagination fixture), in which case append it to `conformanceOnlyTools` instead so it is never reachable outside `enableConformanceMode`.

That's it — `server.ts` auto-registers everything in the `allTools` array with metrics wrapping, and `metadata-contract.test.ts` (`bun run test:metadata` from the repo root) enforces every field above across the whole registry.

## Adding a New Resource

1. Create `src/resources/my-resource-name.ts` (kebab-case filename)
2. Export a resource object (`McpResourceDefinition`) with snake_case `name` (e.g., `my_resource_name`), a `title`, `uri`, `description`, `mimeType`, and `handler` with `(uri: URL, context: McpContext)` signature
3. Resources must never throw — catch errors and return a structured `contents` array
   3a. Set `requiredScope` to one value from `mcpScopes` (`../scopes.js`) — same contract as a tool's `requiredScope`, checked before `resources/read` reaches `handler`.
4. Log errors via `logger.error({ err }, 'description')`
5. Add the resource to `src/resources/index.ts`: import it and append to the `allResources` array

## Adding a New Prompt

1. Create `src/prompts/my-prompt-name.ts` (kebab-case filename)
2. Build it with `definePrompt({ ... })` (from `../types/primitives.js`), giving it a snake_case `name`, a `title`, and a `description`
3. Define `arguments` as a raw Zod shape (not wrapped in `z.object()`) — or `arguments: undefined` for a prompt that takes none — and `handler` with `(arguments_, context: McpContext)` signature
   3a. Set `requiredScope` to one value from `mcpScopes` (`../scopes.js`) — same contract as a tool's `requiredScope`, checked before `prompts/get` reaches `handler`.
4. Prompts must never throw — catch errors and return a fallback `messages` array
5. Log errors via `logger.error({ err }, 'description')`
6. Add the prompt to `src/prompts/index.ts`: import it and append to the `allPrompts` array

Prompts can import Markdown files as template strings: `import template from './templates/my-template.md' with { type: 'text' };`. Bun's default `.md` loader renders Markdown to HTML — omitting `with { type: 'text' }` silently changes the wire content a client reads (a real defect `CONTENT-001` found and fixed on `instructions.md`'s own import; see `server.ts`). The `markdown.d.ts` declaration provides TypeScript support for this pattern.

## Tool Context

All tool, resource, and prompt handlers receive `context: McpContext` which includes:

- `userId: string` — the authenticated user's ID
- `user: McpUserProfile` — pre-fetched user profile (`id`, `email`, `name`, `image`, `role`)

No per-tool database queries needed for user data — it comes from context.

## Adding an MCP App

MCP Apps are interactive HTML interfaces rendered in sandboxed iframes inside host applications. App source lives in `packages/mcp-apps`, which builds self-contained HTML strings importable by this package.

1. Create the component and its mount entry:
   - `packages/mcp-apps/src/applications/{app-name}/{app-name}.svelte` — the component
   - `packages/mcp-apps/src/applications/{app-name}/{app-name}.ts` — the entry the build compiles, which mounts it:
     ```ts
     // Required whenever the component uses a Cinder component or token.
     // Component entries pull in their own CSS; none of them pull in the base,
     // which is what defines the `@layer` order, tokens, foundation, and
     // utilities those rules reference. Without it the built app ships rules
     // against undefined variables and renders unstyled.
     import '@lostgradient/cinder/styles';

     import { mount } from 'svelte';
     import Application from './{app-name}.svelte';

     mount(Application, { target: document.getElementById('root')! });
     ```
   - `mount`, not `hydrate`: an MCP App is client-rendered into an empty `<div id="root">` with no server render to attach to
2. Add the app entry to `packages/mcp-apps/package.json` exports: `"./{app-name}": "./dist/{app-name}.js"`
3. Create a resource in `src/resources/` that imports the built HTML: `import html from '@template/mcp-apps/{app-name}'`
   - Use `RESOURCE_MIME_TYPE` from `@modelcontextprotocol/ext-apps/server` for the mimeType
   - Type declarations are auto-generated during build (`dist/{app-name}.d.ts`). Ensure `@template/mcp-apps` is built before importing
4. Create a tool in `src/tools/` with `_meta: { ui: { resourceUri: 'ui://{app-name}' } }`
5. Optionally add app-only tools with `visibility: ['app']` in `_meta.ui` — these are callable by the app via `callServerTool()` but hidden from the LLM
6. Add to the respective barrel files (`tools/index.ts`, `resources/index.ts`)

## Testing

Run tests with `bun test` from this package directory.

### Test Utilities

Import from `@template/mcp/testing` (or `../testing/...` within this package):

- `createTestContext(overrides?)` — returns a full `McpContext` with `userId` and `user` (test defaults: `test@example.com`, `Test User`)
- `expectToolSuccess(result)` — asserts `content` array exists, `isError` is not true
- `expectToolError(result)` — asserts `content` array exists, `isError` is true
- `expectToolJsonContent(result)` — calls `expectToolSuccess`, parses `content[0].text` as JSON, returns parsed value

### Test Layers

1. **Shape tests** — verify name, description, schema, handler exist (all tools/resources/prompts have these)
2. **Handler tests (pure)** — invoke handler directly with `createTestContext()`, no mocks needed (e.g., `get-user-profile`, `list-audit-events`, `user-profile`)

## Logging Conventions

- Always use `logger` from this package, never `console.log`
- Use child loggers: `logger.child({ tool: 'tool_name', userId })`, `logger.child({ resource: 'resource_name', userId })`, or `logger.child({ prompt: 'prompt_name', userId })`
- Error key is `err` (pino convention), not `error`
