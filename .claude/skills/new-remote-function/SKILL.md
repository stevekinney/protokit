# Skill: New Remote Function

Scaffold a SvelteKit Remote Function with Zod validation.

## Steps

1. Create `applications/web/src/routes/<path>/+page.svelte.ts` or `+layout.svelte.ts`
2. Define the function using SvelteKit's Remote Functions pattern
3. Use `getRequestEvent()` from `$app/server` for request context
4. Validate input with Zod schemas
5. Access the database through `@template/database`

## Template

```typescript
// +page.svelte.ts
import { getRequestEvent } from '$app/server';
import { z } from 'zod';
import { database, schema } from '@template/database';

const inputSchema = z.object({
	// Define input parameters
});

export async function myRemoteFunction(rawInput: unknown) {
	const event = getRequestEvent();
	const user = event.locals.user;

	if (!user) {
		throw new Error('Unauthorized');
	}

	const input = inputSchema.parse(rawInput);

	// Function logic here
	return { success: true };
}
```

## Usage in Svelte Component

```svelte
<script lang="ts">
	import { myRemoteFunction } from './+page.svelte.ts';

	async function handleClick() {
		const result = await myRemoteFunction({
			/* input */
		});
	}
</script>
```
