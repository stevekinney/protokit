# @template/mcp

MCP server factory, tool/resource/prompt definitions, and shared logger.

## Key Files

- `src/server.ts` — `createMcpServer(context)` factory. Creates an McpServer instance and auto-registers all tools, resources, and prompts from barrel files.
- `src/tools/index.ts` — Barrel file exporting individual tools and `allTools` array.
- `src/resources/index.ts` — Barrel file exporting individual resources and `allResources` array.
- `src/prompts/index.ts` — Barrel file exporting individual prompts and `allPrompts` array.
- `src/types/primitives.ts` — `McpToolDefinition`, `McpResourceDefinition`, `McpPromptDefinition`, `McpUserProfile`, `McpContext` types.
- `src/tools/` — One file per tool. Each exports a tool object with `name`, `description`, `inputSchema`, and `handler`.
- `src/resources/` — One file per resource. Each exports a resource object with `name`, `uri`, `description`, `mimeType`, and `handler`.
- `src/prompts/` — One file per prompt. Each exports a prompt object with `name`, `description`, `arguments`, and `handler`.
- `src/logger.ts` — Shared pino logger. JSON in production, pretty-print in development.
- `src/env.ts` — Owns `MCP_SERVER_NAME`, `MCP_CONFORMANCE_MODE`, and `LOG_LEVEL`.
- `src/markdown.d.ts` — Type declarations for importing `.md` files as strings (used by prompt templates and server instructions).
- `src/instructions.md` — Server instructions passed to the MCP client on initialize.

## Adding a New Tool

1. Create `src/tools/my-tool-name.ts` (kebab-case filename)
2. Export a tool object with snake_case `name` (e.g., `my_tool_name`)
3. Define `inputSchema` with Zod, `handler` with `(input, context: McpContext)` signature
4. Tools must never throw — catch errors and return `{ content: [...], isError: true }`
5. Log errors via `logger.error({ err }, 'description')`
6. Add the tool to `src/tools/index.ts`: import it and append to the `allTools` array

That's it — `server.ts` auto-registers everything in the `allTools` array with metrics wrapping.

## Adding a New Resource

1. Create `src/resources/my-resource-name.ts` (kebab-case filename)
2. Export a resource object with snake_case `name` (e.g., `my_resource_name`)
3. Define `uri`, `description`, `mimeType`, and `handler` with `(uri: URL, context: McpContext)` signature
4. Resources must never throw — catch errors and return a structured `contents` array
5. Log errors via `logger.error({ err }, 'description')`
6. Add the resource to `src/resources/index.ts`: import it and append to the `allResources` array

## Adding a New Prompt

1. Create `src/prompts/my-prompt-name.ts` (kebab-case filename)
2. Export a prompt object with snake_case `name` (e.g., `my_prompt_name`)
3. Define `arguments` as a raw Zod shape (not wrapped in `z.object()`), and `handler` with `(arguments_, context: McpContext)` signature
4. Prompts must never throw — catch errors and return a fallback `messages` array
5. Log errors via `logger.error({ err }, 'description')`
6. Add the prompt to `src/prompts/index.ts`: import it and append to the `allPrompts` array

Prompts can import Markdown files as template strings: `import template from './templates/my-template.md';`. The `markdown.d.ts` declaration provides TypeScript support for this pattern.

## Tool Context

All tool, resource, and prompt handlers receive `context: McpContext` which includes:

- `userId: string` — the authenticated user's ID
- `user: McpUserProfile` — pre-fetched user profile (`id`, `email`, `name`, `image`, `role`)

No per-tool database queries needed for user data — it comes from context.

## Adding an MCP App

MCP Apps are interactive HTML interfaces rendered in sandboxed iframes inside host applications. App source lives in `packages/mcp-apps`, which builds self-contained HTML strings importable by this package.

1. Create `packages/mcp-apps/src/applications/{app-name}/{app-name}.tsx`
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
