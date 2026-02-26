# Skill: New MCP Tool

Scaffold a new MCP tool in the template.

## Steps

1. Create `packages/mcp/src/tools/<tool-name>.ts` (kebab-case filename)
2. Define the tool object with:
   - `name`: snake_case (e.g., `my_tool_name`)
   - `description`: Clear, concise description of what the tool does
   - `inputSchema`: Zod schema for input validation
   - `handler`: Async function with `(input, context: { userId: string })` signature
3. Follow the error handling pattern:
   - Create a child logger: `logger.child({ tool: 'tool_name', userId: context.userId })`
   - Wrap handler body in try/catch
   - On success: return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`
   - On failure: log `requestLogger.error({ err }, 'Tool failed')` and return `{ content: [...], isError: true }`
   - Tools must never throw — always return a structured MCP response
4. Register in `packages/mcp/src/server.ts`:
   ```typescript
   server.registerTool(
   	myTool.name,
   	{
   		description: myTool.description,
   		inputSchema: myTool.inputSchema,
   	},
   	async (input) => myTool.handler(input, context),
   );
   ```
5. Re-export from `packages/mcp/src/index.ts`

## Template

```typescript
import { z } from 'zod';
import { logger } from '../logger.js';

export const myToolNameTool = {
	name: 'my_tool_name' as const,
	description: 'Description of what this tool does.',
	inputSchema: z.object({
		// Define input parameters
	}),
	handler: async (
		input: {
			/* typed input */
		},
		context: { userId: string },
	) => {
		const requestLogger = logger.child({ tool: 'my_tool_name', userId: context.userId });
		const start = Date.now();
		try {
			// Tool logic here
			const durationMs = Date.now() - start;
			requestLogger.info({ durationMs }, 'Tool completed');
			return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
		} catch (error) {
			const durationMs = Date.now() - start;
			requestLogger.error({ err: error, durationMs }, 'Tool failed');
			return {
				content: [{ type: 'text' as const, text: 'User-safe error message.' }],
				isError: true,
			};
		}
	},
};
```
