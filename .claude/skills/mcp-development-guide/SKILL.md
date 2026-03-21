# MCP Development Guide

Comprehensive reference for building tools, resources, and prompts in the `@template/mcp` package.

## Tool Development Best Practices

### Input Validation

- Define `inputSchema` with Zod (`z.object({...})`). The SDK validates input against the schema before the handler runs.
- Handlers receive already-validated, typed input as the first argument.

### Error Handling

- Tools must never throw. Catch all errors and return a structured error response.
- Use `createToolErrorResponse(message)` from `tool-response.ts` to build error results.
- The returned object has `{ content: [...], isError: true }`.

```typescript
try {
	// tool logic
	return createToolJsonResponse(data);
} catch (error) {
	requestLogger.error({ err: error, durationMs }, 'Tool failed');
	return createToolErrorResponse('User-safe error message.');
}
```

### Logging

- Create a child logger scoped to the handler:
  - Tools: `logger.child({ tool: 'tool_name', userId: context.userId })`
  - Resources: `logger.child({ resource: 'resource_name', userId: context.userId })`
  - Prompts: `logger.child({ prompt: 'prompt_name', userId: context.userId })`
- Use the pino `err` key for errors: `requestLogger.error({ err }, 'description')`
- Log duration on completion: `requestLogger.info({ durationMs }, 'Tool completed')`

### Database Access

- Import the database dynamically inside the handler for testability:
  ```typescript
  const { database, schema } = await import('@template/database');
  const { eq } = await import('drizzle-orm');
  ```
- This allows `mock.module` to intercept the import during tests.

### Reference Files

- `packages/mcp/src/tools/get-user-profile.ts` — canonical tool with database access, child logger, error handling
- `packages/mcp/src/tools/list-audit-events.ts` — structured content with cursor pagination
- `packages/mcp/src/tool-response.ts` — `createToolTextResponse`, `createToolJsonResponse`, `createToolErrorResponse`

## Testing Patterns

### Test Utilities

Import from `@template/mcp/testing`:

- `createTestContext(overrides?)` — returns `{ userId: string }` with a deterministic test user identifier
- `expectToolSuccess(result)` — asserts `content` is defined, is an array, and `isError` is not `true`
- `expectToolError(result)` — asserts `content` is defined, is an array, and `isError` is `true`
- `expectToolJsonContent(result)` — asserts success, then parses and returns the JSON from the first content block

### Three Testing Layers

1. **Shape tests** — verify the tool exports (`name`, `description`, `inputSchema`, `handler`) without calling the handler
2. **Handler tests (pure)** — call the handler directly with known input and a test context; no mocking needed for tools without external dependencies
3. **Handler tests (with `mock.module`)** — use Bun's `mock.module` to stub `@template/database` or other imports, then call the handler

### Running Tests

```bash
bun test          # run from packages/mcp/
bun test --watch  # watch mode
```

### Reference Files

- `packages/mcp/src/tools/get-user-profile.test.ts` — shape tests for a tool
- `packages/mcp/src/testing/context.ts` — `createTestContext`
- `packages/mcp/src/testing/tool-assertions.ts` — `expectToolSuccess`, `expectToolError`, `expectToolJsonContent`

## Advanced MCP Features

### Progress Notifications

Send incremental progress updates to the client during long-running operations.

- Read the progress token from `extra` using `readProgressToken(extra)` from `handler-context.ts`
- Read the notification sender using `readNotificationSender(extra)` from `handler-context.ts`
- Send `notifications/progress` with `{ progressToken, progress, total }`
- Reference: conformance fixture `test_tool_with_progress` in `conformance-fixture-registration.ts`

```typescript
const progressToken = readProgressToken(extra);
const sendNotification = readNotificationSender(extra);
if (progressToken !== undefined && sendNotification) {
	await sendNotification({
		method: 'notifications/progress',
		params: { progressToken, progress: 0, total: 100 },
	});
}
```

### Logging Notifications

Send structured log messages to the client during tool execution.

- Use `readNotificationSender(extra)` to get the sender function
- Send `notifications/message` with `{ level, data }`
- Reference: conformance fixture `test_tool_with_logging` in `conformance-fixture-registration.ts`

```typescript
const sendNotification = readNotificationSender(extra);
if (sendNotification) {
	await sendNotification({
		method: 'notifications/message',
		params: { level: 'info', data: 'Processing step completed' },
	});
}
```

### Sampling

Request the client to sample an LLM on the server's behalf.

- Use `readRequestSender(extra)` from `handler-context.ts` to get the request sender
- Send `sampling/createMessage` with `{ messages, maxTokens }`
- Parse the response with `parseSampledText(result)` from `handler-context.ts`
- Check support with `assertSamplingSupport(extra)` (throws `McpError` if unsupported)
- Reference: conformance fixture `test_sampling` in `conformance-fixture-registration.ts`

```typescript
const sendRequest = readRequestSender(extra);
const sampledResult = await sendRequest(
	{
		method: 'sampling/createMessage',
		params: {
			messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
			maxTokens: 100,
		},
	},
	CreateMessageResultSchema,
);
const responseText = parseSampledText(sampledResult);
```

### Elicitation

Request structured input from the user via the client.

- Use `readRequestSender(extra)` from `handler-context.ts`
- Send `elicitation/create` with `{ message, requestedSchema }` where `requestedSchema` is a JSON Schema object
- The result contains `{ action, content }` where `action` is the user's response action
- Reference: conformance fixtures `test_elicitation`, `test_elicitation_sep1034_defaults`, `test_elicitation_sep1330_enums` in `conformance-fixture-registration.ts`

```typescript
const sendRequest = readRequestSender(extra);
const result = await sendRequest(
	{
		method: 'elicitation/create',
		params: {
			message: 'Please provide your details',
			requestedSchema: {
				type: 'object',
				properties: {
					username: { type: 'string', description: "User's name" },
				},
				required: ['username'],
			},
		},
	},
	ElicitResultSchema,
);
```

### Resource Subscriptions

Allow clients to subscribe to resource changes and receive update notifications.

- Register subscription capabilities: `server.server.registerCapabilities({ resources: { subscribe: true, listChanged: true } })`
- Handle `SubscribeRequestSchema` and `UnsubscribeRequestSchema` request handlers on `server.server`
- Publish updates via `server.server.sendResourceUpdated({ uri })`
- Reference: conformance fixture `test_watched_resource_update` and subscription handlers in `conformance-fixture-registration.ts`

## Response Patterns

### Tool Responses

| Pattern                          | Helper                                                    | Example                                       |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| Plain text                       | `createToolTextResponse(text)`                            | Status messages, simple results               |
| JSON data                        | `createToolJsonResponse(data)`                            | Structured objects serialized as JSON text    |
| Error                            | `createToolErrorResponse(message)`                        | User-safe error messages with `isError: true` |
| Structured content with metadata | Spread `createToolTextResponse` + add `structuredContent` | `list-audit-events.ts` pagination pattern     |

### Specialized Content Types (Conformance Fixtures)

- **Image**: `{ type: 'image', data: base64String, mimeType: 'image/png' }`
- **Audio**: `{ type: 'audio', data: base64String, mimeType: 'audio/wav' }`
- **Embedded resource**: `{ type: 'resource', resource: { uri, mimeType, text } }`
- **Multiple content types**: Array containing text, image, and resource blocks in a single response

### Resource Handler Shape

```typescript
{
	contents: [
		{
			uri: uri.href,
			mimeType: 'application/json',
			text: JSON.stringify(data),
		},
	],
}
```

### Prompt Handler Shape

```typescript
{
	messages: [
		{
			role: 'user',
			content: {
				type: 'text',
				text: 'Prompt content here.',
			},
		},
	],
}
```

Prompts can also include image content (`type: 'image'`) and embedded resource content (`type: 'resource'`) in their messages. See `conformance-fixture-registration.ts` for examples.
