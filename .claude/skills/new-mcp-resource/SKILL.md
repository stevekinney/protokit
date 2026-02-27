# Skill: New MCP Resource

Scaffold a new MCP resource in the template.

## Steps

1. Create `packages/mcp/src/resources/<resource-name>.ts` (kebab-case filename)
2. Define the resource object with:
   - `name`: snake_case (e.g., `my_resource_name`)
   - `uri`: Static URI string (e.g., `my://resource`)
   - `description`: Clear, concise description of what the resource exposes
   - `mimeType`: MIME type of the resource content (e.g., `application/json`)
   - `handler`: Async function with `(uri: URL, context: { userId: string })` signature
3. Follow the error handling pattern:
   - Create a child logger: `logger.child({ resource: 'resource_name', userId: context.userId })`
   - Wrap handler body in try/catch
   - On success: return `{ contents: [{ uri: uri.href, mimeType, text: JSON.stringify(result) }] }`
   - On failure: log `requestLogger.error({ err }, 'Resource read failed')` and return a structured error in the same shape
   - Resources must never throw — always return a structured MCP response
4. Register in `packages/mcp/src/server.ts`:
   ```typescript
   server.registerResource(
   	myResource.name,
   	myResource.uri,
   	{ description: myResource.description, mimeType: myResource.mimeType },
   	async (uri) => myResource.handler(uri, context),
   );
   ```
5. Re-export from `packages/mcp/src/index.ts`

## Template

```typescript
import { logger } from '../logger.js';

export const myResourceNameResource = {
	name: 'my_resource_name' as const,
	uri: 'my://resource',
	description: 'Description of what this resource exposes.',
	mimeType: 'application/json',
	handler: async (uri: URL, context: { userId: string }) => {
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
