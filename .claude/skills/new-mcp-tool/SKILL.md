# Skill: New MCP Tool

Scaffold a new MCP tool in the template. `packages/mcp/CLAUDE.md`'s "Adding a New Tool" section is
the canonical, actively-maintained step list — read it first. This file is a matching quick-start
template.

## Steps

1. Create `packages/mcp/src/tools/<tool-name>.ts` (kebab-case filename).
2. Build it with `defineTool({ ... })` from `../types/primitives.js` — not a bare object literal.
   `title`, `description`, `annotations` (all four hints), and `requiredScope` are required fields on
   `McpToolDefinition`; omitting any of them is a `tsc` error, not a silent gap.
3. Give it a snake_case `name` (at most 64 characters), a `title`, and an outcome-focused "use this
   when…" `description`.
4. Define `inputSchema` with Zod, giving every parameter its own `.describe()`. If the tool returns
   machine-readable data, also define `outputSchema` and return `structuredContent` via
   `createToolStructuredResponse` (`../tool-response.js`) — a tool with no structured result can omit
   `outputSchema` entirely.
5. Set `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`)
   accurately — never both `readOnlyHint: true` and `destructiveHint: true`.
6. Set `requiredScope` to one value from `mcpScopes` (`../scopes.js`) — checked before every
   invocation; an under-scoped call never reaches `handler`.
7. `handler` takes `(input, context: McpContext)`. Tools must never throw — catch errors, log via
   `logger.error({ err }, 'description')`, and return `{ content: [...], isError: true }`.
8. Add it to `src/tools/index.ts`'s `allTools` array — unless it returns synthetic/generated data
   purely to exercise a protocol behavior (like the conformance-only `list_audit_events`), in which
   case append it to `conformanceOnlyTools` instead. Nothing else needs to change in `server.ts`:
   every entry in `allTools`/`conformanceOnlyTools` is auto-registered with metrics wrapping and
   scope enforcement already applied.

## Template

```typescript
import { z } from 'zod';
import { logger } from '../logger.js';
import { defineTool } from '../types/primitives.js';
import { createToolStructuredResponse, createToolErrorResponse } from '../tool-response.js';

const outputSchema = z.object({
	// Define the structured result shape
});

export const myToolNameTool = defineTool({
	name: 'my_tool_name',
	title: 'My Tool Name',
	description: 'Use this when… — describe the outcome, not just the mechanism.',
	inputSchema: z.object({
		// Define input parameters, each with its own .describe('...')
	}),
	outputSchema,
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	requiredScope: 'profile:read',
	handler: async (input, context) => {
		const requestLogger = logger.child({ tool: 'my_tool_name', userId: context.userId });
		const start = Date.now();
		try {
			const result = {/* build the outputSchema-shaped result */};
			requestLogger.info({ durationMs: Date.now() - start }, 'Tool completed');
			return createToolStructuredResponse(result, 'Short human-readable summary.');
		} catch (error) {
			requestLogger.error({ err: error, durationMs: Date.now() - start }, 'Tool failed');
			return createToolErrorResponse('User-safe error message.');
		}
	},
});
```

## Testing

Add `packages/mcp/src/tools/my-tool-name.test.ts` covering the shape (name/title/annotations
present), a success case asserting `structuredContent` validates against the tool's own
`outputSchema`, and an error case. `metadata-contract.test.ts` (`bun run test:metadata`) enforces the
registry-wide contract automatically — no new assertions needed there for an ordinary tool.
