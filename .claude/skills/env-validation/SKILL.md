# Skill: Environment Variable Validation

Patterns for managing environment variables with `@t3-oss/env-core`.

## Per-Package Ownership

Each package owns its environment variables in its own `src/env.ts`:

| Package             | Variables                                                                     |
| ------------------- | ----------------------------------------------------------------------------- |
| `packages/database` | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`                                       |
| `packages/mcp`      | `MCP_TOKEN_TTL_SECONDS`                                                       |
| `applications/web`  | `NEON_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_APP_URL` |

## Adding a New Variable

1. Determine which package owns the variable
2. Add to that package's `src/env.ts`:
   ```typescript
   server: {
     MY_NEW_VAR: z.string().min(1),
   },
   runtimeEnv: {
     MY_NEW_VAR: process.env.MY_NEW_VAR,
   },
   ```
3. Add to root `.env.example` with a comment
4. Add to `.env.local` for local development
5. Set on Railway: `railway variable set MY_NEW_VAR=value`
6. If needed in CI, add as a GitHub secret

## Rules

- Never read `process.env` directly — always go through `env.ts`
- Never use SvelteKit's `$env/static/private` or `$env/dynamic/private`
- Always set `emptyStringAsUndefined: true`
- Use `skipValidation: process.env.SKIP_ENV_VALIDATION === 'true'` for CI
- Client variables must be prefixed with `PUBLIC_`
