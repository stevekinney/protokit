# Skill: New MCP Prompt

Scaffold a new MCP prompt in the template. `packages/mcp/CLAUDE.md`'s "Adding a New Prompt" section
is the canonical, actively-maintained step list — read it first. This file is a matching quick-start
template.

## Steps

1. Create `packages/mcp/src/prompts/<prompt-name>.ts` (kebab-case filename)
2. Build it with `definePrompt({ ... })` from `../types/primitives.js`, giving it:
   - `name`: snake_case (e.g., `my_prompt_name`)
   - `title`: human-readable display name
   - `description`: clear, concise description of what the prompt does
   - `arguments`: raw Zod shape (not wrapped in `z.object()`) defining the prompt arguments, or
     `arguments: undefined` for a prompt that takes none
   - `requiredScope`: one value from `mcpScopes` (`../scopes.js`) — checked before `prompts/get`
     reaches `handler`
   - `handler`: async function with `(arguments_, context: McpContext)` signature
3. Follow the error handling pattern:
   - Create a child logger: `logger.child({ prompt: 'prompt_name', userId: context.userId })`
   - Wrap handler body in try/catch
   - On success: return `{ messages: [{ role: 'user', content: { type: 'text', text: '...' } }] }`
   - On failure: log `requestLogger.error({ err }, 'Prompt failed')` and return a fallback message
   - Prompts must never throw — always return a structured MCP response
4. Add it to `src/prompts/index.ts`'s `allPrompts` array — nothing else needs to change in
   `server.ts`; every entry is auto-registered with scope enforcement already applied.
5. Re-export from `packages/mcp/src/index.ts` if it needs to be importable from outside the package.

## Template

```typescript
import { z } from 'zod';
import { logger } from '../logger.js';
import { definePrompt } from '../types/primitives.js';

export const myPromptNamePrompt = definePrompt({
	name: 'my_prompt_name',
	title: 'My Prompt Name',
	description: 'Description of what this prompt does.',
	arguments: {
		myArgument: z.string().describe('Description of the argument'),
	},
	requiredScope: 'prompts:read',
	handler: async (arguments_, context) => {
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
});
```

## Using Markdown Templates

Prompt handlers can import `.md` files as strings for template content:

```typescript
import templateContent from './templates/my-template.md' with { type: 'text' };

// In the handler:
const rendered = templateContent.replace('{variable}', actualValue);
```

`with { type: 'text' }` is required, not optional — Bun's default `.md` loader renders Markdown to
HTML, which is never what you want for text a client reads as prose (a real defect `CONTENT-001`
found and fixed on `instructions.md`'s own import). Create template files in
`packages/mcp/src/prompts/templates/`. The `markdown.d.ts` declaration in `packages/mcp/src/`
provides TypeScript support for this pattern.
