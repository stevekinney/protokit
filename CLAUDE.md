# SvelteKit MCP Template

## Monorepo Structure

- `applications/web` — SvelteKit app (UI + MCP server + OAuth endpoints)
- `packages/database` — Drizzle schema, migrations, shared DB client
- `packages/mcp` — MCP tool/resource/prompt definitions + shared logger

## Package Manager & Task Runner

- Always use `bun`, never `npm` or `yarn`
- Use `bunx` instead of `npx`
- Run tasks via `bun turbo <task>` (e.g. `bun turbo dev`, `bun turbo typecheck`)

## TypeScript

- Each package/app manages its own `tsconfig.json` — no root tsconfig
- SvelteKit generates its own via `svelte-kit sync` — never edit `.svelte-kit/tsconfig.json`

## Validation

- Zod v3: `import { z } from 'zod'` (`^3.24.0`)
- Never install `drizzle-zod` — define Zod schemas manually alongside Drizzle schema

## SvelteKit Patterns

- Use Remote Functions for server communication
- Use Attachments over legacy `use:action` enhancers
- `getRequestEvent()` from `$app/server` for request context

## Environment Variables

- Never read `process.env` directly — import from that package's `src/env.ts`
- Never use `$env/static/private` or `$env/dynamic/private`
- `packages/*` must not import from `applications/*`

## Logging

- Never use `console.log`, `console.error`, or `console.warn` in server code
- Import: `import { logger } from '@template/mcp/logger'`
- Errors: `logger.error({ err }, 'description')` — pass error as `err` key

## MCP Tool Naming

- Snake_case always: `get_user_profile`, not `get-user-profile`

## File & Identifier Naming

- Kebab-case for all file names: `get-user-profile.ts`, `token-validation.ts`
  (except SvelteKit route files and tool config files which follow their own conventions)
- Full words, no abbreviations: `configuration` not `config`, `utilities` not `utils`,
  `parameters` not `params`, `authentication` not `auth`, `database` not `db`,
  `response` not `res`, `request` not `req`, `initialize` not `init`
- Exceptions where the abbreviation is the actual API: pino's `{ err }` key,
  Drizzle's exported `db` instance, Svelte's `$props()` and DOM refs

## Deployment

- Railway via `adapter-node` (not Vercel)
- Neon region default: `aws-us-east-2` (Ohio), configurable

## MVP: Keep the Codebase Clean

- No backwards compatibility layers, deprecation warnings, or feature flags
- No `@deprecated` JSDoc — delete the code instead
- If an API changes, update all callsites; do not add shims
- When in doubt, delete rather than comment out

## Testing

- `bun test` in `packages/*`
- `vitest` in `applications/web`
- Never try to run Vitest in packages or bun test in the web app

## Linting & Formatting

- ESLint + Prettier (not Biome — Biome is explicitly excluded)
- `bun turbo lint` to lint, `bun turbo format` to format

## Before Installing Packages

- Always confirm with the user before running `bun add` or `bun add -D`
- State what package you want to add and why
