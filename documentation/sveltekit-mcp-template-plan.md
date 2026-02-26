# SvelteKit MCP Template — Complete Implementation Plan

A production-ready SvelteKit monorepo template for building MCP servers with
OAuth authentication, targeting claude.ai's custom connector flow.

---

## 1. Monorepo Structure

```
sveltekit-mcp-template/
├── applications/
│   └── web/                          # SvelteKit app
│       ├── src/
│       │   ├── hooks.server.ts       # MCP handler wired here
│       │   ├── env.ts                # @t3-oss/env-core schema
│       │   ├── lib/
│       │   │   └── auth.ts           # Neon Auth client
│       │   └── routes/
│       │       ├── authorize/
│       │       │   └── +page.svelte  # OAuth approval UI
│       │       ├── token/
│       │       │   └── +server.ts    # POST /token
│       │       ├── register/
│       │       │   └── +server.ts    # POST /register
│       │       └── .well-known/
│       │           └── oauth-authorization-server/
│       │               └── +server.ts
│       ├── static/
│       ├── vite.config.ts            # Vitest config lives here
│       ├── svelte.config.js
│       ├── tsconfig.json             # app-level, not root
│       └── package.json
├── packages/
│   ├── database/
│   │   ├── src/
│   │   │   ├── index.ts              # exports db, schema
│   │   │   ├── schema.ts             # Drizzle schema
│   │   │   └── env.ts                # DATABASE_URL validation
│   │   ├── drizzle.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── mcp/
│       ├── src/
│       │   ├── index.ts              # exports tools, resources, prompts
│       │   ├── logger.ts             # shared pino instance
│       │   ├── tools/
│       │   │   └── get-user-profile.ts  # placeholder tool
│       │   └── env.ts                # MCP_TOKEN_TTL_SECONDS etc.
│       ├── tsconfig.json
│       └── package.json
├── scripts/
│   ├── setup.ts                      # interactive setup wizard
│   └── rename.ts                     # @template/* → @your-org/your-app
├── .claude/
│   ├── settings.json                 # hooks config
│   ├── commands/
│   │   ├── commit.md
│   │   ├── migrate.md
│   │   ├── tunnel.md
│   │   └── typecheck.md
│   └── skills/
│       ├── new-mcp-tool/
│       │   └── SKILL.md
│       ├── new-remote-function/
│       │   └── SKILL.md
│       ├── new-migration/
│       │   └── SKILL.md
│       ├── debug-mcp/
│       │   └── SKILL.md
│       ├── oauth-flow/
│       │   └── SKILL.md
│       ├── logging/
│       │   └── SKILL.md
│       └── env-validation/
│           └── SKILL.md
├── .github/
│   └── workflows/
│       ├── pull-request.yml
│       └── production.yml
├── .husky/
│   └── pre-commit
├── .vscode/
│   ├── settings.json
│   └── extensions.json
├── CLAUDE.md                         # root, under 100 lines
├── turbo.json
├── package.json                      # workspace root
├── .env.example
├── .env.local                        # gitignored
├── vercel.json
└── README.md
```

---

## 2. Package Namespace

All internal packages use `@template/*` as a placeholder:

- `@template/database`
- `@template/mcp`

`bun scripts/rename.ts @acme/my-app` replaces every reference across all
`package.json` files, import statements, `CLAUDE.md`, and `turbo.json`.
This is the first step in the README after cloning.

---

## 3. Core Stack

| Concern           | Choice                                                   |
| ----------------- | -------------------------------------------------------- |
| Framework         | SvelteKit                                                |
| Runtime           | Bun                                                      |
| Database          | Neon Postgres                                            |
| ORM               | Drizzle ORM                                              |
| Schema validation | `drizzle-orm/zod` (never `drizzle-zod`)                  |
| Auth              | Neon Auth (managed Better Auth)                          |
| MCP transport     | Streamable HTTP (spec 2025-03-26)                        |
| MCP library       | `@modelcontextprotocol/sdk`                              |
| Hosting           | Vercel (`adapter-vercel`, explicit)                      |
| Monorepo          | Turborepo with Vercel remote caching                     |
| Validation        | Zod v4 — `import { z } from 'zod'` everywhere            |
| Env validation    | `@t3-oss/env-core` with `emptyStringAsUndefined: true`   |
| Logging           | `pino` — JSON in prod, pretty-print in dev               |
| Dev tunneling     | Cloudflare Tunnels (`bunx cloudflared tunnel`)           |
| MCP debugging     | `bunx @modelcontextprotocol/inspector` (never installed) |

---

## 4. Coding Conventions

These apply everywhere in the codebase and are enforced via CLAUDE.md, skills,
and ESLint rules where possible.

### File Naming

- **Kebab-case for all files**: `get-user-profile.ts`, `oauth-utilities.ts`,
  `token-validation.ts`
- Exception: SvelteKit route files follow SvelteKit conventions
  (`+page.svelte`, `+server.ts`, `hooks.server.ts`)
- Exception: Config files follow their tool's convention (`drizzle.config.ts`,
  `svelte.config.js`, `vite.config.ts`)

### Identifier Naming

- **Full words, no abbreviations**
  - `configuration` not `config`
  - `utilities` not `utils`
  - `parameters` not `params`
  - `properties` not `props` (except in Svelte component context where `$props()` is the API)
  - `authentication` not `auth` (except as a proper noun, e.g. "Neon Auth")
  - `authorization` not `authz`
  - `database` not `db` (except in Drizzle's own exported `db` instance)
  - `environment` not `env` (except in `env.ts` filenames which are a project convention)
  - `error` not `err` (except as the pino logging key `{ err }` which is pino's convention)
  - `response` not `res`, `request` not `req`
  - `source` not `src` (except in directory names which are a project convention)
  - `directory` not `dir`
  - `temporary` not `temp` or `tmp`
  - `initialize` not `init`
  - `reference` not `ref` (except in Svelte's `$state`, `bind:`, or DOM ref context)

### MVP Mindset

This is an MVP template. Keep the codebase clean and forward-looking only:

- **No backwards compatibility layers** — if an API changes, update all callsites
- **No deprecation warnings** — remove old code, don't mark it deprecated
- **No feature flags** for old behavior
- **No migration paths** for hypothetical prior users
- **No shims or polyfills** beyond what the target runtime actually needs
- **No `@deprecated` JSDoc tags** — delete the code instead
- When in doubt, delete rather than comment out

---

## 5. Authentication & OAuth

### User Auth

- Neon Auth (Google login) via `@neondatabase/auth`
- Foreign key from all app tables directly to `neon_auth.users.id`
- No separate users table

### MCP OAuth

Full OAuth 2.1 + PKCE flow targeting claude.ai custom connector:

| Endpoint                                      | File                                        |
| --------------------------------------------- | ------------------------------------------- |
| `GET /.well-known/oauth-authorization-server` | metadata JSON                               |
| `GET /authorize`                              | shows approval UI, checks Neon Auth session |
| `POST /token`                                 | exchanges code, validates PKCE              |
| `POST /register`                              | dynamic client registration                 |

**Token strategy:** Long-lived access tokens, no refresh token rotation.
Revocation = delete row from `oauth_tokens` table.

### Database Schema for OAuth

```typescript
// packages/database/src/schema.ts (OAuth tables)
oauth_clients; // registered MCP clients
oauth_codes; // short-lived auth codes + PKCE challenge
oauth_tokens; // issued access tokens, FK to neon_auth.users.id
```

### PKCE Validation (required, Claude is strict)

```typescript
const challenge = crypto.createHash('sha256').update(code_verifier).digest('base64url');
if (challenge !== stored_code_challenge) {
	return error('invalid_grant');
}
```

---

## 6. MCP Server

### Wiring

Lives in `applications/web/src/hooks.server.ts`. The SvelteKit `handle` hook
intercepts all requests to `/mcp` and hands them to the SDK's Streamable HTTP
transport. All other requests pass through normally.

### Tool Naming

Snake_case. Always. `get_user_profile`, not `get-user-profile`.

### Placeholder Tool: `get_user_profile`

Ships with the template to demonstrate full wiring end-to-end:

- Defined in `packages/mcp/src/tools/get-user-profile.ts`
- Input schema via Zod v4
- Reads from `neon_auth.users` via `packages/database`
- Logs via shared pino logger
- Wired into `hooks.server.ts`

This also allows the setup script to verify the MCP server is working
before handing off to the builder.

### Tool Structure Pattern

```typescript
// packages/mcp/src/tools/get-user-profile.ts
export const getUserProfileTool = {
	name: 'get_user_profile',
	description: "Returns the authenticated user's profile information.",
	inputSchema: z.object({}),
	handler: async (_input: unknown, context: { userId: string }) => {
		const reqLogger = logger.child({
			tool: 'get_user_profile',
			userId: context.userId,
		});
		try {
			// ... db query
			reqLogger.info({ durationMs }, 'Tool completed');
			return { content: [{ type: 'text', text: JSON.stringify(profile) }] };
		} catch (err) {
			reqLogger.error({ err }, 'Tool failed');
			throw err;
		}
	},
};
```

---

## 7. Logging

Shared logger in `packages/mcp/src/logger.ts` using `pino`.

```typescript
import pino from 'pino';

export const logger = pino({
	level: process.env.LOG_LEVEL ?? 'info',
	...(process.env.NODE_ENV !== 'production' && {
		transport: { target: 'pino-pretty' },
	}),
});
```

### Rules

- Never use `console.log`, `console.error`, or `console.warn` in server code
- Always import `logger` from `@template/mcp/logger`
- Errors: `logger.error({ err }, 'description')` — `err` key, not `error`
- Use child loggers for request context: `logger.child({ requestId, userId })`
- Never log full tokens, passwords, or PII beyond `userId`

---

## 8. Environment Variables

### Ownership by Package

| Package             | Variables                                                                     |
| ------------------- | ----------------------------------------------------------------------------- |
| `packages/database` | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`                                       |
| `packages/mcp`      | `MCP_TOKEN_TTL_SECONDS` (optional)                                            |
| `applications/web`  | `NEON_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_APP_URL` |

### Rules

- Never read `process.env` directly — always import from that package's `src/env.ts`
- Never use SvelteKit's `$env/static/private` or `$env/dynamic/private` virtual modules
- `packages/*` must never import from `applications/*`
- `skipValidation: true` in CI lint/typecheck jobs only

### Web App Pattern

```typescript
// applications/web/src/env.ts
import { createEnv } from '@t3-oss/env-core';
import { vercel } from '@t3-oss/env-core/presets-zod';
import { z } from 'zod';

export const env = createEnv({
	extends: [vercel()],
	server: {
		NEON_AUTH_URL: z.url(),
		GOOGLE_CLIENT_ID: z.string().min(1),
		GOOGLE_CLIENT_SECRET: z.string().min(1),
	},
	clientPrefix: 'PUBLIC_',
	client: {
		PUBLIC_APP_URL: z.url(),
	},
	runtimeEnv: {
		NEON_AUTH_URL: process.env.NEON_AUTH_URL,
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
		PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
	},
	emptyStringAsUndefined: true,
});
```

---

## 9. TypeScript

- **No root `tsconfig.json`** — each package/app owns its own
- SvelteKit auto-generates `.svelte-kit/tsconfig.json` via `svelte-kit sync` — never edit manually
- `applications/web/tsconfig.json` extends SvelteKit's generated config
- `packages/database/tsconfig.json` and `packages/mcp/tsconfig.json` are standalone

---

## 10. Linting & Formatting

### Tools

- ESLint + `eslint-plugin-svelte` + `svelte-eslint-parser`
- Prettier + `prettier-plugin-svelte`
- Husky + lint-staged for pre-commit enforcement
- **Biome is explicitly excluded** — confirmed bugs with Svelte 5 idempotency

### ESLint Config

```javascript
// eslint.config.js
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs.recommended,
	{
		files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: tseslint.parser, svelteConfig },
		},
	},
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
);
```

### Prettier Config

```json
{
	"plugins": ["prettier-plugin-svelte"],
	"overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

### Husky Pre-commit

lint-staged runs Prettier then ESLint on staged files only.

---

## 11. Testing

### Rule

**`bun test` in `packages/*`, Vitest in `applications/web`.**
The split exists because `bun test` cannot understand Svelte files, Vite virtual
modules (`$app/stores` etc.), or SvelteKit path aliases. Vitest shares Vite's
transform pipeline with the dev server, making it the only correct choice for
the web app.

### Web App Testing Stack

- Vitest (configured in `vite.config.ts`)
- `vitest-browser-svelte` + Playwright (browser provider: Chromium)
- Two test projects in one Vitest config:
  - `client` — component tests, runs in real Chromium, files: `**/*.svelte.test.ts`
  - `ssr` — server-side logic, runs in Node, files: `**/*.ssr.test.ts`

### Packages Testing

- `bun test` — zero config, native TypeScript support
- File pattern: `**/*.test.ts`

### Turborepo

`bun turbo test` runs both test runners from the root. No confusion needed —
the correct runner is invoked by each package's `test` script.

---

## 12. Turborepo

### `turbo.json`

```json
{
	"$schema": "https://turbo.build/schema.json",
	"ui": "tui",
	"tasks": {
		"build": {
			"dependsOn": ["^build"],
			"outputs": [".svelte-kit/**", "dist/**"],
			"cache": true
		},
		"dev": {
			"dependsOn": ["^build"],
			"cache": false,
			"persistent": true
		},
		"typecheck": {
			"dependsOn": ["^build"],
			"cache": true
		},
		"lint": {
			"cache": true
		},
		"format": {
			"cache": false
		},
		"test": {
			"dependsOn": ["^build"],
			"cache": true,
			"outputs": ["coverage/**"]
		},
		"db:generate": {
			"cache": false
		},
		"db:migrate": {
			"cache": false
		},
		"db:validate": {
			"dependsOn": ["db:generate"],
			"cache": false
		}
	}
}
```

Note: `db:migrate` and `db:validate` are **never cached** — migrations must
always run against the actual database.

---

## 13. Vercel Configuration

### `vercel.json`

Optimized for Neon: co-locate functions in `iad1` (AWS us-east-1, same region
as Neon's default). Change if your Neon project is in a different region.

```json
{
	"regions": ["iad1"],
	"functions": {
		"applications/web/**": {
			"maxDuration": 30
		}
	}
}
```

### `adapter-vercel`

Used explicitly in `svelte.config.js` — never `adapter-auto`.

```javascript
import adapter from '@sveltejs/adapter-vercel';
```

---

## 14. CI/CD

### Pull Request Workflow (`.github/workflows/pull-request.yml`)

1. `bun turbo typecheck`
2. `bun turbo lint`
3. Create Neon branch for the PR (includes auth state)
4. `bun turbo db:validate` against branch DB
5. Cleanup: delete Neon branch after checks pass

### Production Workflow (`.github/workflows/production.yml`)

1. `bun turbo db:migrate` against production Neon
2. Vercel auto-deploys on push to main (parallel to migrations)

### Required GitHub Secrets

| Secret                | Purpose                              |
| --------------------- | ------------------------------------ |
| `TURBO_TOKEN`         | Vercel remote caching                |
| `TURBO_TEAM`          | Vercel remote caching                |
| `NEON_PROJECT_ID`     | Branch creation in CI                |
| `NEON_API_KEY`        | Branch creation in CI                |
| `DATABASE_URL`        | Production migrations                |
| `SKIP_ENV_VALIDATION` | Set to `true` in lint/typecheck jobs |

---

## 15. Claude Code Configuration

### `CLAUDE.md` (root, under 100 lines)

```markdown
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

- Zod v4: `import { z } from 'zod'` (never `from 'zod/v4'`)
- Drizzle schema validation: `import { createSelectSchema } from 'drizzle-orm/zod'`
- Never install `drizzle-zod`

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
```

### `.claude/settings.json` — Hooks

```json
{
	"hooks": {
		"PostToolUse": [
			{
				"matcher": "Write|Edit",
				"hooks": [
					{
						"type": "command",
						"command": "bunx prettier --write \"$CLAUDE_TOOL_INPUT_PATH\" 2>/dev/null; bunx eslint --fix \"$CLAUDE_TOOL_INPUT_PATH\" 2>/dev/null; true"
					}
				]
			}
		]
	}
}
```

Prettier runs before ESLint. `true` at the end prevents unfixable lint errors
from blocking the agent.

### Skills (`.claude/skills/`)

| Skill                          | Purpose                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `new-mcp-tool/SKILL.md`        | Scaffold a tool: Zod schema in `packages/mcp`, handler, wiring in hook, logging pattern, long-lived token auth |
| `new-remote-function/SKILL.md` | Scaffold a SvelteKit Remote Function with Zod schema                                                           |
| `new-migration/SKILL.md`       | Create Drizzle migration, validate, explain application steps                                                  |
| `debug-mcp/SKILL.md`           | Start Cloudflare tunnel + MCP Inspector, testing workflow                                                      |
| `oauth-flow/SKILL.md`          | OAuth endpoint reference, long-lived token model, PKCE, revocation                                             |
| `logging/SKILL.md`             | pino patterns, child loggers, what/what-not to log                                                             |
| `env-validation/SKILL.md`      | `@t3-oss/env-core` patterns, per-package ownership, checklist for adding new vars                              |

### Slash Commands (`.claude/commands/`)

| Command        | Action                                                           |
| -------------- | ---------------------------------------------------------------- |
| `commit.md`    | Stage all, generate conventional commit message, commit          |
| `migrate.md`   | Run Drizzle migrations against current branch DB                 |
| `tunnel.md`    | Start Cloudflare tunnel, print MCP URL for claude.ai             |
| `typecheck.md` | Run tsc across all packages, attribute errors to correct package |

---

## 16. VS Code Configuration

### `.vscode/settings.json`

```json
{
	"editor.defaultFormatter": "esbenp.prettier-vscode",
	"editor.formatOnSave": true,
	"editor.codeActionsOnSave": {
		"source.fixAll.eslint": "explicit"
	},
	"[svelte]": {
		"editor.defaultFormatter": "svelte.svelte-vscode"
	},
	"eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact", "svelte"],
	"svelte.enable-ts-plugin": true
}
```

### `.vscode/extensions.json`

```json
{
	"recommendations": [
		"svelte.svelte-vscode",
		"esbenp.prettier-vscode",
		"dbaeumer.vscode-eslint",
		"Prisma.prisma",
		"biomejs.biome"
	]
}
```

Note: Biome is listed as a recommendation for its non-Svelte capabilities
(JSON formatting) but is NOT used for linting or formatting in this project.

---

## 17. Scripts

### `scripts/setup.ts`

Interactive wizard. Run once after cloning (or after `rename.ts`).

**Phase 1 — Automated**

- Check prerequisites: `neonctl`, `vercel`, `gh` CLIs
- Create Neon project
- Get `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` → write to `.env.local`
- Enable Neon Auth via Neon API
- Get `NEON_AUTH_URL` → write to `.env.local`
- Confirm: Google login works immediately with Neon's shared dev credentials

**Phase 2 — Guided (production Google OAuth only)**

- Prompt: skip for now or configure production credentials
- If configuring: open Google Cloud Console URL, print exact redirect URI to copy
- Collect `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` interactively
- Register credentials with Neon Auth via API

**Phase 3 — Automated**

- Push all env vars to Vercel (`vercel env add`)
- Set GitHub secrets (`gh secret set`)
- Run initial migration (`bun turbo db:migrate`)
- Print summary

### `scripts/rename.ts`

```bash
bun scripts/rename.ts @acme/my-app
```

Replaces `@template/*` with `@acme/*` across:

- All `package.json` files (name field + dependencies)
- All TypeScript import statements
- `CLAUDE.md`
- `turbo.json`
- `README.md`

Prints a summary of every file changed. This is the **first step** in the
README after cloning, before anything else.

---

## 18. Local Development Workflow

```bash
# 1. Clone and rename
git clone <repo> my-app && cd my-app
bun scripts/rename.ts @acme/my-app

# 2. Install
bun install

# 3. Run setup wizard (creates Neon project, populates .env.local)
bun scripts/setup.ts

# 4. Start dev server
bun turbo dev

# 5. In a second terminal — expose MCP server for claude.ai testing
bunx cloudflared tunnel --url http://localhost:5173/mcp

# 6. Debug MCP locally
bunx @modelcontextprotocol/inspector
```

---

## 19. Remaining Decisions for Implementation

The following were intentionally left open — the template should not
prescribe them:

- **Actual MCP tools** beyond `get_user_profile` stub
- **User data schema** beyond auth and OAuth tables
- **Rate limiting** (add when needed: Vercel built-in or Upstash)
- **User token revocation UI** (add to web app when shipping)
- **E2E tests** with Playwright (unit/component tests are scaffolded)
- **Renovate/Dependabot** dependency automation

---

## 20. Key Decisions Reference

| Decision             | Choice                                      | Reason                                                        |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| Linter/formatter     | ESLint + Prettier                           | Biome has confirmed idempotency bug with Svelte 5 + `--write` |
| OAuth token strategy | Long-lived, no refresh                      | Simplicity for early stage; revoke by deleting DB row         |
| MCP transport        | Streamable HTTP                             | Required for claude.ai web connector                          |
| tRPC                 | Excluded                                    | Remote Functions cover web app, MCP SDK covers protocol layer |
| `drizzle-zod`        | Excluded                                    | Use `drizzle-orm/zod` directly                                |
| `adapter-auto`       | Excluded                                    | Use `adapter-vercel` explicitly                               |
| Biome                | Excluded                                    | Confirmed bugs with Svelte 5 as of Feb 2026                   |
| Log drains           | Excluded                                    | Pro/Enterprise only; pino to stdout is sufficient             |
| Renovate/Dependabot  | Excluded                                    | Not appropriate for a template                                |
| Root `tsconfig.json` | Excluded                                    | Per-package configs; SvelteKit generates its own              |
| Vercel region        | `iad1`                                      | Co-located with Neon default region (AWS us-east-1)           |
| Package namespace    | `@template/*`                               | Renamed via `scripts/rename.ts`                               |
| MCP tool naming      | snake_case                                  | Community convention; matches Claude's tool call format       |
| File naming          | kebab-case                                  | Consistent, shell-safe, avoids case-sensitivity issues        |
| Identifier naming    | Full words                                  | Readability; abbreviations are ambiguous to AI agents         |
| MVP scope            | No backwards compat                         | Clean codebase; no legacy surface area                        |
| Testing (packages)   | `bun test`                                  | Native, zero config                                           |
| Testing (web)        | Vitest + vitest-browser-svelte + Playwright | Only option that understands Svelte + Vite                    |
