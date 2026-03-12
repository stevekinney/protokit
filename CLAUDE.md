# Bun + React MCP Template

## Monorepo Structure

- `applications/web` — Bun-native React SSR app (UI + OAuth endpoints + MCP server transport)
- `packages/database` — Drizzle schema, migrations, shared database client
- `packages/mcp` — MCP tool/resource/prompt definitions + shared logger

## Package Manager & Task Runner

- Always use `bun`, never `npm` or `yarn`
- Use `bunx` instead of `npx`
- Run tasks via `bun turbo <task>` (for example `bun turbo dev`, `bun turbo typecheck`)

## TypeScript

- Each package/application manages its own `tsconfig.json`
- `applications/web` uses explicit path aliases (`@web/*`) and Bun-compatible JSX settings

## Validation

- Zod v4: `import { z } from 'zod'`
- Never install `drizzle-zod` — define Zod schemas manually alongside Drizzle schema

## Environment Variables

- Never read `process.env` directly — import from that package's `src/env.ts`
- `packages/*` must not import from `applications/*`

## Logging

- Never use `console.log`, `console.error`, or `console.warn` in server code
- Import: `import { logger } from '@template/mcp/logger'`
- Errors: `logger.error({ err }, 'description')`

## MCP Naming

- Snake_case always for tools, resources, and prompts: `get_user_profile`, not `get-user-profile`
- Directory convention: `src/tools/`, `src/resources/`, `src/prompts/`

## File & Identifier Naming

- Kebab-case for file names: `get-user-profile.ts`, `token-validation.ts`
- Full words, no abbreviations: `configuration`, `utilities`, `parameters`, `authentication`, `database`, `response`, `request`, `initialize`
- Exceptions where the abbreviation is the real API: pino `{ err }`, Drizzle `db` instance

## Deployment

- Railway deployment runs Bun directly
- Neon region default: `aws-us-east-2` (Ohio), configurable

## MVP: Keep the Codebase Clean

- No backwards compatibility layers, deprecation warnings, or feature flags
- No `@deprecated` JSDoc
- If an API changes, update all callsites; do not add shims
- When in doubt, delete rather than comment out

## Testing

- `bun test` in `packages/*`
- `bun test` in `applications/web`

## Linting & Formatting

- ESLint + Prettier (Biome excluded)
- `bun turbo lint` to lint, `bun turbo format` to format

## Before Installing Packages

- Always confirm with the user before running `bun add` or `bun add -D`
- State what package you want to add and why
