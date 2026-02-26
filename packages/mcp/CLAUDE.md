# @template/mcp

MCP server factory, tool definitions, and shared logger.

## Key Files

- `src/server.ts` — `createMcpServer(context)` factory. Creates an McpServer instance and registers all tools.
- `src/tools/` — One file per tool. Each exports a tool object with `name`, `description`, `inputSchema`, and `handler`.
- `src/logger.ts` — Shared pino logger. JSON in production, pretty-print in development.
- `src/env.ts` — Owns `MCP_TOKEN_TTL_SECONDS`.

## Adding a New Tool

1. Create `src/tools/my-tool-name.ts` (kebab-case filename)
2. Export a tool object with snake_case `name` (e.g., `my_tool_name`)
3. Define `inputSchema` with Zod, `handler` with `(input, context)` signature
4. Tools must never throw — catch errors and return `{ content: [...], isError: true }`
5. Log errors via `logger.error({ err }, 'description')`
6. Register the tool in `src/server.ts` via `server.registerTool()`
7. Re-export from `src/index.ts`

## Logging Conventions

- Always use `logger` from this package, never `console.log`
- Use child loggers: `logger.child({ tool: 'tool_name', userId })`
- Error key is `err` (pino convention), not `error`
