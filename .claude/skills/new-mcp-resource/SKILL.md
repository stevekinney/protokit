# Skill: New MCP Resource

Scaffold a new MCP resource in the template. `packages/mcp/CLAUDE.md`'s "Adding a New Resource"
section is the canonical, actively-maintained step list — read it first. This file is a matching
quick-start template.

## Steps

1. Create `packages/mcp/src/resources/<resource-name>.ts` (kebab-case filename).
2. Export a resource object typed as `McpResourceDefinition` (`../types/primitives.js`) with:
   - `name`: snake_case (e.g., `my_resource_name`)
   - `title`: human-readable display name
   - `uri`: static URI string (e.g., `my://resource`)
   - `description`: clear, concise description of what the resource exposes
   - `mimeType`: MIME type of the resource content (e.g., `application/json`)
   - `requiredScope`: one value from `mcpScopes` (`../scopes.js`) — checked before `resources/read`
     reaches `handler`
   - `handler`: async function with `(uri: URL, context: McpContext)` signature
3. Follow the error handling pattern:
   - Create a child logger: `logger.child({ resource: 'resource_name', userId: context.userId })`
   - Wrap handler body in try/catch
   - On success: return `{ contents: [{ uri: uri.href, mimeType, text: JSON.stringify(result) }] }`
   - On failure: log `requestLogger.error({ err }, 'Resource read failed')` and return a structured error in the same shape
   - Resources must never throw — always return a structured MCP response
4. Add it to `src/resources/index.ts`'s `allResources` array — nothing else needs to change in
   `server.ts`; every entry is auto-registered with scope enforcement already applied.
5. Re-export from `packages/mcp/src/index.ts` if it needs to be importable from outside the package.

## Template

```typescript
import type { McpResourceDefinition } from '../types/primitives.js';
import { logger } from '../logger.js';

export const myResourceNameResource: McpResourceDefinition = {
	name: 'my_resource_name',
	title: 'My Resource Name',
	uri: 'my://resource',
	description: 'Description of what this resource exposes.',
	mimeType: 'application/json',
	requiredScope: 'profile:read',
	handler: async (uri, context) => {
		const requestLogger = logger.child({ resource: 'my_resource_name', userId: context.userId });
		const start = Date.now();
		try {
			// Resource logic here
			const durationMs = Date.now() - start;
			requestLogger.info({ durationMs }, 'Resource read completed');
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: 'application/json',
						text: JSON.stringify(result),
					},
				],
			};
		} catch (error) {
			const durationMs = Date.now() - start;
			requestLogger.error({ err: error, durationMs }, 'Resource read failed');
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: 'application/json',
						text: JSON.stringify({ error: 'User-safe error message.' }),
					},
				],
			};
		}
	},
};
```
