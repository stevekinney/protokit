# Skill: Logging

Pino logging patterns used throughout the codebase.

## Setup

The shared logger lives in `packages/mcp/src/logger.ts`:

- JSON output in production
- Pretty-printed output in development (via `pino-pretty`)
- Log level controlled by `LOG_LEVEL` env var (default: `info`)

## Patterns

### Import

```typescript
import { logger } from '@template/mcp/logger';
```

### Child Loggers

Create child loggers for request/tool context:

```typescript
const requestLogger = logger.child({ tool: 'tool_name', userId: context.userId });
requestLogger.info({ durationMs }, 'Tool completed');
```

### Error Logging

Always use `err` as the key (pino convention):

```typescript
requestLogger.error({ err }, 'Description of what failed');
```

### What to Log

- Tool execution start/completion with duration
- Session creation and closure
- OAuth flow steps (registration, authorization, token exchange)
- Database query failures

### What NOT to Log

- Full access tokens, passwords, or secrets
- PII beyond `userId`
- Request/response bodies (unless debugging)
- Successful health checks or routine operations

## Rules

- Never use `console.log`, `console.error`, or `console.warn` in server code
- Always use the shared `logger` instance
- Use structured logging (pass objects, not string interpolation)
