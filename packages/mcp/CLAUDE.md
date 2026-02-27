# @template/mcp

MCP server factory, tool/resource/prompt definitions, and shared logger.

## Key Files

- `src/server.ts` — `createMcpServer(context)` factory. Creates an McpServer instance and registers all tools, resources, and prompts.
- `src/tools/` — One file per tool. Each exports a tool object with `name`, `description`, `inputSchema`, and `handler`.
- `src/resources/` — One file per resource. Each exports a resource object with `name`, `uri`, `description`, `mimeType`, and `handler`.
- `src/prompts/` — One file per prompt. Each exports a prompt object with `name`, `description`, `arguments`, and `handler`.
- `src/logger.ts` — Shared pino logger. JSON in production, pretty-print in development.
- `src/env.ts` — Owns `MCP_TOKEN_TTL_SECONDS`.
- `src/text-imports.d.ts` — Type declarations for importing `.md` files as strings (used by prompt templates).

## Adding a New Tool

1. Create `src/tools/my-tool-name.ts` (kebab-case filename)
2. Export a tool object with snake_case `name` (e.g., `my_tool_name`)
3. Define `inputSchema` with Zod, `handler` with `(input, context)` signature
4. Tools must never throw — catch errors and return `{ content: [...], isError: true }`
5. Log errors via `logger.error({ err }, 'description')`
6. Register the tool in `src/server.ts` via `server.registerTool()`
7. Re-export from `src/index.ts`

## Adding a New Resource

1. Create `src/resources/my-resource-name.ts` (kebab-case filename)
2. Export a resource object with snake_case `name` (e.g., `my_resource_name`)
3. Define `uri`, `description`, `mimeType`, and `handler` with `(uri: URL, context)` signature
4. Resources must never throw — catch errors and return a structured `contents` array
5. Log errors via `logger.error({ err }, 'description')`
6. Register the resource in `src/server.ts` via `server.registerResource()`
7. Re-export from `src/index.ts`

## Adding a New Prompt

1. Create `src/prompts/my-prompt-name.ts` (kebab-case filename)
2. Export a prompt object with snake_case `name` (e.g., `my_prompt_name`)
3. Define `arguments` as a raw Zod shape (not wrapped in `z.object()`), and `handler` with `(arguments_, context)` signature
4. Prompts must never throw — catch errors and return a fallback `messages` array
5. Log errors via `logger.error({ err }, 'description')`
6. Register the prompt in `src/server.ts` via `server.registerPrompt()`
7. Re-export from `src/index.ts`

Prompts can import Markdown files as template strings: `import template from './templates/my-template.md' with { type: 'text' };`. The `text-imports.d.ts` declaration provides TypeScript support for this pattern.

## Logging Conventions

- Always use `logger` from this package, never `console.log`
- Use child loggers: `logger.child({ tool: 'tool_name', userId })`, `logger.child({ resource: 'resource_name', userId })`, or `logger.child({ prompt: 'prompt_name', userId })`
- Error key is `err` (pino convention), not `error`
