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
- User session creation and sign-out (the browser cookie session, not an MCP protocol session —
  the MCP transport is stateless per-request, so there is no MCP "session" to log the lifecycle of)
- OAuth flow steps: registration, authorization, token exchange, refresh, revocation
- Database query failures

`OBS-001` (`RUNBOOK.md`) formalizes this into a convention: every OAuth/MCP log line carries an
`event` field naming the surface and an `outcome` field naming the specific result (e.g.
`event: "oauth_token_exchange"`, `outcome: "refresh_replay"`) — search on those two fields, never on
a token, code, or secret value. Read `RUNBOOK.md`'s outcome table before adding a new log line so a
new surface reuses the existing `event`/`outcome` vocabulary instead of inventing a parallel one.

### What NOT to Log

- Full access tokens, passwords, secrets, or anything the logger's own redaction list already
  removes (`packages/mcp/src/logger.ts`: `authorization`, `cookie`, `token`, `access_token`,
  `refresh_token`, `id_token`, `code`, `code_verifier`, `code_challenge`, `client_secret`,
  `password`, `DATABASE_URL`, `REDIS_URL`, `email`, plus `Bearer <token>`/JWT/connection-string
  shapes anywhere in the serialized line, regardless of key)
- PII beyond `userId` — `email` is explicitly redacted even though it looks like an ordinary field
- Raw user-supplied prompt/tool input content — log a length or hash, not the content itself, unless
  the explicit, production-refused `LOG_CONTENT_DIAGNOSTICS_UNTIL` diagnostic window is active (see
  `RUNBOOK.md`)
- Request/response bodies (unless debugging)
- Successful health checks or routine operations

`bun run audit:logs` statically scans for a credential-shaped variable interpolated directly into a
log _message_ string — the one shape key-based redaction cannot reach. `redaction.test.ts` is the
runtime proof. Run both after adding a new log call site that might carry a credential-shaped value.

## Rules

- Never use `console.log`, `console.error`, or `console.warn` in server code
- Always use the shared `logger` instance
- Use structured logging (pass objects, not string interpolation)
