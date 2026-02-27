# Skill: New MCP Prompt

Scaffold a new MCP prompt in the template.

## Steps

1. Create `packages/mcp/src/prompts/<prompt-name>.ts` (kebab-case filename)
2. Define the prompt object with:
   - `name`: snake_case (e.g., `my_prompt_name`)
   - `description`: Clear, concise description of what the prompt does
   - `arguments`: Raw Zod shape (not wrapped in `z.object()`) defining the prompt arguments
   - `handler`: Async function with `(arguments_: { ... }, context: { userId: string })` signature
3. Follow the error handling pattern:
   - Create a child logger: `logger.child({ prompt: 'prompt_name', userId: context.userId })`
   - Wrap handler body in try/catch
   - On success: return `{ messages: [{ role: 'user', content: { type: 'text', text: '...' } }] }`
   - On failure: log `requestLogger.error({ err }, 'Prompt failed')` and return a fallback message
   - Prompts must never throw — always return a structured MCP response
4. Register in `packages/mcp/src/server.ts`:
   ```typescript
   server.registerPrompt(
   	myPrompt.name,
   	{ description: myPrompt.description, argsSchema: myPrompt.arguments },
   	async (arguments_) => myPrompt.handler(arguments_, context),
   );
   ```
5. Re-export from `packages/mcp/src/index.ts`

## Template

```typescript
import { z } from 'zod';
import { logger } from '../logger.js';

export const myPromptNamePrompt = {
	name: 'my_prompt_name' as const,
	description: 'Description of what this prompt does.',
	arguments: {
		myArgument: z.string().describe('Description of the argument'),
	},
	handler: async (arguments_: { myArgument: string }, context: { userId: string }) => {
		const requestLogger = logger.child({ prompt: 'my_prompt_name', userId: context.userId });
		try {
			requestLogger.info('Prompt requested');
			return {
				messages: [
					{
						role: 'user' as const,
						content: {
							type: 'text' as const,
							text: `Prompt text using ${arguments_.myArgument} for user ${context.userId}`,
						},
					},
				],
			};
		} catch (error) {
			requestLogger.error({ err: error }, 'Prompt failed');
			return {
				messages: [
					{
						role: 'user' as const,
						content: {
							type: 'text' as const,
							text: 'An error occurred while generating the prompt.',
						},
					},
				],
			};
		}
	},
};
```

## Using Markdown Templates

Prompt handlers can import `.md` files as strings for template content:

```typescript
import templateContent from './templates/my-template.md' with { type: 'text' };

// In the handler:
const rendered = templateContent.replace('{variable}', actualValue);
```

Create template files in `packages/mcp/src/prompts/templates/`. The `text-imports.d.ts` declaration in `packages/mcp/src/` provides TypeScript support.
