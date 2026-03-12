# SvelteKit MCP Template

A production-ready template for building [Model Context Protocol](https://modelcontextprotocol.io) servers with SvelteKit, featuring OAuth 2.0 with PKCE, Google authentication via Neon Auth, and Railway deployment.

## What You Get

- **MCP Server** — Streamable HTTP transport at `/mcp`, authenticated via OAuth Bearer tokens, pinned to protocol `2025-11-25`
- **OAuth 2.0 + PKCE** — Full authorization server with dynamic client registration (RFC 7591), token exchange (RFC 6749), S256 code challenges (RFC 7636), and optional `client_credentials`
- **Google Sign-In** — Via Neon Auth (Better Auth under the hood), with shared dev credentials for prototyping
- **Postgres** — Neon serverless Postgres with Drizzle ORM, schema migrations, and CI validation
- **Redis Coordination** — Shared MCP session ownership and sliding-window rate limiting
- **Extension Surface** — MCP Apps UI, OAuth client credentials, and enterprise-managed authorization policy hooks
- **Monorepo** — Turborepo with three packages, Bun as the package manager

## Project Structure

```
applications/web/          SvelteKit app — UI, OAuth endpoints, MCP transport
packages/database/         Drizzle schema, migrations, shared database client
packages/mcp/              MCP server factory, tool definitions, shared logger
scripts/                   Setup wizard, migration runner, scope renamer
```

### Key Files

| File                                                          | Purpose                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `applications/web/src/hooks.server.ts`                        | Dual auth — Bearer tokens for `/mcp`, Neon Auth sessions for everything else |
| `applications/web/src/lib/mcp-handler.ts`                     | MCP transport handling with Redis-backed ownership and affinity validation   |
| `applications/web/src/routes/mcp/+server.ts`                  | GET/POST/DELETE handlers for Streamable HTTP                                 |
| `applications/web/src/routes/token/+server.ts`                | OAuth code-to-token exchange with PKCE validation                            |
| `applications/web/src/routes/authorize/`                      | OAuth consent page (requires authenticated session)                          |
| `applications/web/src/routes/register/+server.ts`             | Dynamic client registration (RFC 7591)                                       |
| `packages/mcp/src/server.ts`                                  | `createMcpServer(context)` factory — register tools, resources, and prompts  |
| `packages/mcp/src/tools/get-user-profile.ts`                  | Example MCP tool — returns the authenticated user's profile                  |
| `packages/mcp/src/tools/render-account-dashboard.ts`          | MCP Apps example tool — returns UI-linked state payload                      |
| `packages/mcp/src/resources/account-dashboard-application.ts` | MCP Apps UI resource (`ui://account-dashboard`)                              |
| `packages/mcp/src/resources/user-profile.ts`                  | Example MCP resource — exposes user profile as a JSON resource               |
| `packages/mcp/src/prompts/summarize.ts`                       | Example MCP prompt — generates a topic summarization prompt                  |
| `packages/database/src/schema.ts`                             | All table definitions (OAuth clients, codes, tokens, MCP sessions)           |

## Prerequisites

- [Bun](https://bun.sh) (v1.2+)
- [Neon CLI](https://neon.tech/docs/reference/neon-cli) (`brew install neonctl`)
- [GitHub CLI](https://cli.github.com/) (`brew install gh`) — for CI secrets
- [Railway CLI](https://docs.railway.com/guides/cli) (`brew install railway`) — for deployment

## Quick Start

### Automated Setup

The setup wizard creates a Neon project, configures environment variables, and optionally sets up Railway and GitHub secrets:

```sh
bun install
bun scripts/setup.ts
```

The wizard will:

1. Create a Neon project and write `DATABASE_URL` / `DATABASE_URL_UNPOOLED` to `.env.local`
2. Generate `BETTER_AUTH_SECRET` and write it to `.env.local`
3. Optionally configure Google OAuth credentials
4. Configure `REDIS_URL` and rate-limit defaults
5. Configure MCP protocol/origin/extension defaults
6. Optionally initialize a Railway project and sync environment variables
7. Optionally set GitHub secrets for CI/CD
8. Run the initial database migration
9. Run `svelte-kit sync` to generate SvelteKit types

### Manual Setup

1. **Install dependencies**

   ```sh
   bun install
   ```

2. **Create a Neon project** and enable Neon Auth in the [Neon Console](https://console.neon.tech):

   ```sh
   neonctl projects create --region-id aws-us-east-2
   # Then enable Neon Auth in the Console: https://console.neon.tech/app/projects/YOUR_PROJECT_ID/auth
   ```

3. **Create `.env.local`** in the project root:

   ```sh
   # Required
   DATABASE_URL=<pooled connection string from Neon>
   DATABASE_URL_UNPOOLED=<direct connection string from Neon>
   REDIS_URL=<redis connection string>
   BETTER_AUTH_SECRET=<random string, at least 32 characters>
   GOOGLE_CLIENT_ID=<your Google OAuth client ID>
   GOOGLE_CLIENT_SECRET=<your Google OAuth client secret>

   # Optional
   BETTER_AUTH_URL=http://localhost:3000
   RATE_LIMIT_REGISTER_MAX=10
   RATE_LIMIT_REGISTER_WINDOW_SECONDS=60
   RATE_LIMIT_TOKEN_MAX=30
   RATE_LIMIT_TOKEN_WINDOW_SECONDS=60
   MCP_PROTOCOL_VERSION=2025-11-25
   MCP_ALLOWED_ORIGINS=http://localhost:3000
   MCP_CONFORMANCE_MODE=false
   MCP_ENABLE_UI_EXTENSION=true
   MCP_ENABLE_CLIENT_CREDENTIALS=true
   MCP_ENABLE_ENTERPRISE_AUTH=true
   MCP_TOKEN_TTL_SECONDS=3600
   ENTERPRISE_AUTH_PROVIDER_URL=
   ENTERPRISE_AUTH_TENANT=
   ENTERPRISE_AUTH_AUDIENCE=
   ENTERPRISE_AUTH_CLIENT_ID=
   ENTERPRISE_AUTH_CLIENT_SECRET=
   ENTERPRISE_AUTH_ALLOWED_CLIENT_IDS=
   LOG_LEVEL=info
   ```

4. **Generate and run migrations**

   ```sh
   bun turbo db:generate
   bun scripts/migrate.ts
   ```

5. **Start the dev server**

   ```sh
   bun turbo dev
   ```

   The app runs at `http://localhost:3000`.

## Environment Variables

### Required

| Variable                | Package              | Description                                          |
| ----------------------- | -------------------- | ---------------------------------------------------- |
| `DATABASE_URL`          | `@template/database` | Neon pooled connection string                        |
| `DATABASE_URL_UNPOOLED` | `@template/database` | Direct connection string (used for migrations)       |
| `REDIS_URL`             | `@template/web`      | Redis URL for session coordination and rate limiting |
| `MCP_ALLOWED_ORIGINS`   | `@template/web`      | Allowed `Origin` values for `/mcp` (comma-separated) |
| `BETTER_AUTH_SECRET`    | `@template/web`      | Random string, at least 32 characters                |
| `GOOGLE_CLIENT_ID`      | `@template/web`      | Google OAuth client ID                               |
| `GOOGLE_CLIENT_SECRET`  | `@template/web`      | Google OAuth client secret                           |

### Optional

| Variable                             | Package         | Default       | Description                                                          |
| ------------------------------------ | --------------- | ------------- | -------------------------------------------------------------------- |
| `BETTER_AUTH_URL`                    | `@template/web` | —             | Public URL (auto-derived from `RAILWAY_PUBLIC_DOMAIN` if unset)      |
| `RATE_LIMIT_REGISTER_MAX`            | `@template/web` | `10`          | Maximum `/register` requests per window per client IP                |
| `RATE_LIMIT_REGISTER_WINDOW_SECONDS` | `@template/web` | `60`          | `/register` rate-limit window duration in seconds                    |
| `RATE_LIMIT_TOKEN_MAX`               | `@template/web` | `30`          | Maximum `/token` requests per window per client identifier           |
| `RATE_LIMIT_TOKEN_WINDOW_SECONDS`    | `@template/web` | `60`          | `/token` rate-limit window duration in seconds                       |
| `MCP_PROTOCOL_VERSION`               | `@template/web` | `2025-11-25`  | Required MCP protocol version (latest-only mode)                     |
| `MCP_CONFORMANCE_MODE`               | `@template/web` | `false`       | Enables conformance-only MCP fixtures and localhost rebinding checks |
| `MCP_ENABLE_UI_EXTENSION`            | `@template/web` | `true`        | Advertise/enable MCP Apps UI extension behavior                      |
| `MCP_ENABLE_CLIENT_CREDENTIALS`      | `@template/web` | `true`        | Advertise/enable OAuth `client_credentials` grant                    |
| `MCP_ENABLE_ENTERPRISE_AUTH`         | `@template/web` | `true`        | Enable enterprise policy checks for token issuance and MCP access    |
| `ENTERPRISE_AUTH_PROVIDER_URL`       | `@template/web` | —             | Enterprise policy/IdP provider URL                                   |
| `ENTERPRISE_AUTH_TENANT`             | `@template/web` | —             | Enterprise tenant identifier                                         |
| `ENTERPRISE_AUTH_AUDIENCE`           | `@template/web` | —             | Enterprise audience identifier                                       |
| `ENTERPRISE_AUTH_CLIENT_ID`          | `@template/web` | —             | Enterprise policy client identifier                                  |
| `ENTERPRISE_AUTH_CLIENT_SECRET`      | `@template/web` | —             | Enterprise policy client secret                                      |
| `ENTERPRISE_AUTH_ALLOWED_CLIENT_IDS` | `@template/web` | —             | Comma-separated allowlist used by the default policy adapter         |
| `MCP_TOKEN_TTL_SECONDS`              | `@template/mcp` | `3600`        | OAuth access token lifetime in seconds                               |
| `LOG_LEVEL`                          | `@template/mcp` | `info`        | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`)  |
| `NODE_ENV`                           | `@template/mcp` | `development` | `development`, `production`, or `test`                               |
| `SKIP_ENV_VALIDATION`                | all             | —             | Set to `true` to skip Zod validation (used in CI)                    |

Each package validates its own environment variables via `src/env.ts` using Zod. Import from the relevant `env.ts` rather than reading `process.env` directly.

## Development

### Commands

| Command                 | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `bun turbo dev`         | Start dev server on port 3000                        |
| `bun turbo build`       | Production build                                     |
| `bun turbo typecheck`   | TypeScript checking across all packages              |
| `bun turbo lint`        | ESLint across all packages                           |
| `bun turbo format`      | Prettier across all packages                         |
| `bun turbo test`        | Run all tests                                        |
| `bun turbo db:generate` | Generate Drizzle migration files from schema changes |
| `bun turbo db:validate` | Validate migrations match the current schema         |

Known warning:

- Vite/Rollup may print `Unknown output options: codeSplitting` during SvelteKit builds. This does not fail the build and is currently treated as non-blocking upstream noise.

### Testing MCP Locally

1. **Start the dev server:**

   ```sh
   bun turbo dev
   ```

2. **Expose via Cloudflare Tunnel** (for testing with claude.ai):

   ```sh
   bunx cloudflared tunnel --url http://localhost:3000/mcp
   ```

   Add the tunnel URL as a custom MCP connector in claude.ai to test the full OAuth flow.

3. **Or use the MCP Inspector** (for local debugging):

   ```sh
   bunx @modelcontextprotocol/inspector
   ```

### Testing

- `packages/database` and `packages/mcp` use `bun test`
- `applications/web` uses `vitest`
- Run everything with `bun turbo test`

## Adding MCP Tools

1. Create a new file in `packages/mcp/src/tools/` (kebab-case filename):

   ```typescript
   // packages/mcp/src/tools/list-projects.ts
   import { z } from 'zod';
   import { database, schema } from '@template/database';
   import { logger } from '../logger.js';

   export const listProjectsTool = {
   	name: 'list_projects' as const,
   	description: 'Lists all projects for the authenticated user.',
   	inputSchema: z.object({
   		limit: z.number().optional().default(10),
   	}),
   	handler: async (input: { limit: number }, context: { userId: string }) => {
   		try {
   			// Your logic here
   			return {
   				content: [{ type: 'text' as const, text: JSON.stringify(results) }],
   			};
   		} catch (error) {
   			logger.error({ err: error }, 'list_projects failed');
   			return {
   				content: [{ type: 'text' as const, text: 'Failed to list projects.' }],
   				isError: true,
   			};
   		}
   	},
   };
   ```

2. Register it in `packages/mcp/src/server.ts`:

   ```typescript
   import { listProjectsTool } from './tools/list-projects.js';

   server.registerTool(
   	listProjectsTool.name,
   	{
   		description: listProjectsTool.description,
   		inputSchema: listProjectsTool.inputSchema,
   	},
   	async (input) => listProjectsTool.handler(input, context),
   );
   ```

Tool conventions:

- Tool names use `snake_case` (e.g., `list_projects`)
- Filenames use kebab-case (e.g., `list-projects.ts`)
- Tools must never throw — catch errors and return `{ content: [...], isError: true }`
- Log errors via `logger.error({ err }, 'description')` (use `err` as the key, per pino convention)

## Adding MCP Resources

1. Create a new file in `packages/mcp/src/resources/` (kebab-case filename):

   ```typescript
   // packages/mcp/src/resources/project-settings.ts
   import { logger } from '../logger.js';

   export const projectSettingsResource = {
   	name: 'project_settings' as const,
   	uri: 'project://settings',
   	description: 'Exposes the project settings as a JSON resource.',
   	mimeType: 'application/json',
   	handler: async (uri: URL, context: { userId: string }) => {
   		try {
   			// Your logic here
   			return {
   				contents: [
   					{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(result) },
   				],
   			};
   		} catch (error) {
   			logger.error({ err: error }, 'project_settings read failed');
   			return {
   				contents: [
   					{
   						uri: uri.href,
   						mimeType: 'application/json',
   						text: JSON.stringify({ error: 'Failed to read project settings.' }),
   					},
   				],
   			};
   		}
   	},
   };
   ```

2. Register it in `packages/mcp/src/server.ts`:

   ```typescript
   import { projectSettingsResource } from './resources/project-settings.js';

   server.registerResource(
   	projectSettingsResource.name,
   	projectSettingsResource.uri,
   	{
   		description: projectSettingsResource.description,
   		mimeType: projectSettingsResource.mimeType,
   	},
   	async (uri) => projectSettingsResource.handler(uri, context),
   );
   ```

Resource conventions:

- Resource names use `snake_case` (e.g., `project_settings`)
- Filenames use kebab-case (e.g., `project-settings.ts`)
- Resources must never throw — catch errors and return a structured `contents` array
- Return shape: `{ contents: [{ uri, mimeType, text }] }`

## Adding MCP Prompts

1. Create a new file in `packages/mcp/src/prompts/` (kebab-case filename):

   ```typescript
   // packages/mcp/src/prompts/explain.ts
   import { z } from 'zod';
   import { logger } from '../logger.js';

   export const explainPrompt = {
   	name: 'explain' as const,
   	description: 'Generates a prompt asking to explain a concept.',
   	arguments: {
   		concept: z.string().describe('The concept to explain'),
   	},
   	handler: async (arguments_: { concept: string }, context: { userId: string }) => {
   		try {
   			return {
   				messages: [
   					{
   						role: 'user' as const,
   						content: {
   							type: 'text' as const,
   							text: `Please explain ${arguments_.concept} for user ${context.userId}.`,
   						},
   					},
   				],
   			};
   		} catch (error) {
   			logger.error({ err: error }, 'explain prompt failed');
   			return {
   				messages: [
   					{
   						role: 'user' as const,
   						content: { type: 'text' as const, text: 'An error occurred.' },
   					},
   				],
   			};
   		}
   	},
   };
   ```

2. Register it in `packages/mcp/src/server.ts`:

   ```typescript
   import { explainPrompt } from './prompts/explain.js';

   server.registerPrompt(
   	explainPrompt.name,
   	{ description: explainPrompt.description, argsSchema: explainPrompt.arguments },
   	async (arguments_) => explainPrompt.handler(arguments_, context),
   );
   ```

Prompt conventions:

- Prompt names use `snake_case` (e.g., `explain`)
- Filenames use kebab-case (e.g., `explain.ts`)
- Define `arguments` as a raw Zod shape (not wrapped in `z.object()`)
- Prompts must never throw — catch errors and return a fallback `messages` array
- Return shape: `{ messages: [{ role, content: { type, text } }] }`

## Neon Auth Architecture

This template uses [Neon Auth](https://neon.tech/docs/guides/neon-auth-guide) (Better Auth under the hood) for user authentication. Neon Auth manages four tables in the `neon_auth` schema (`user`, `session`, `account`, `verification`) — these are referenced in `packages/database/src/schema.ts` but never migrated by Drizzle.

**Shared dev credentials:** Neon Auth provides shared Google OAuth credentials for development. These work out of the box but are for prototyping only.

**Production:** You must create your own Google OAuth credentials in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Additionally, `BETTER_AUTH_SECRET` must be a random string of at least 32 characters (the setup wizard generates one automatically).

## OAuth Flow

The template implements a complete OAuth 2.0 authorization server for MCP clients:

```
MCP Client                          This Server
    │                                    │
    ├─ POST /register ──────────────────►│  Dynamic client registration
    │◄── { client_id, client_secret } ───┤
    │                                    │
    ├─ GET /.well-known/oauth-           │
    │      authorization-server ────────►│  Discover endpoints
    │◄── { token_endpoint, ... } ────────┤
    │                                    │
    ├─ GET /authorize?client_id=...     ►│  User sees consent page
    │   &code_challenge=...              │  (redirects to Google sign-in
    │                                    │   if not authenticated)
    │◄── 302 redirect_uri?code=... ──────┤
    │                                    │
    ├─ POST /token ─────────────────────►│  Exchange code for token
    │   { code, code_verifier }          │  (PKCE S256 validated)
    │◄── { access_token, ... } ──────────┤
    │                                    │
    ├─ POST /mcp ───────────────────────►│  MCP requests with
    │   Authorization: Bearer <token>    │  Bearer authentication
    │◄── MCP response ──────────────────┤
```

Security details:

- All credentials (tokens, authorization codes, client secrets) are stored as SHA-256 hashes
- PKCE is mandatory (S256 only)
- Authorization codes are validated before consumption (invalid requests don't burn the code)
- Token and secret comparisons use timing-safe equality checks
- CORS headers are set on all OAuth and discovery endpoints
- `/register` and `/token` use Redis sliding-window rate limiting (`429 rate_limited` with `Retry-After`)
- MCP sessions are stored in Redis with owner-instance metadata (`409 session_affinity_required` on misrouted requests)
- `/mcp` enforces strict protocol behavior: latest-only `MCP-Protocol-Version` (`2025-11-25`), strict `Accept`/`Content-Type` checks, and structured JSON error payloads
- `/mcp` uses explicit `Origin` allowlisting (`MCP_ALLOWED_ORIGINS`) instead of wildcard CORS
- Origin handling rules: missing `Origin` is allowed for non-browser clients, `Origin: null` is rejected, and non-allowlisted origins return `403`
- `MCP_CONFORMANCE_MODE=true` enables conformance fixture tools/resources/prompts and applies localhost DNS rebinding protection for `/mcp` (only `localhost`, `127.0.0.1`, and `[::1]` Host/Origin values are accepted)
- Enterprise authorization policy checks run before token issuance and before `/mcp` access when `MCP_ENABLE_ENTERPRISE_AUTH=true`

### Extension Support Matrix

| Extension                        | Identifier                                                 | Status                  | Notes                                                                         |
| -------------------------------- | ---------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| MCP Apps UI                      | `io.modelcontextprotocol/ui`                               | supported               | Includes `ui://account-dashboard` HTML app resource + tool-linked UI metadata |
| OAuth Client Credentials         | `io.modelcontextprotocol/oauth-client-credentials`         | supported               | Dynamic registration + `/token` grant support with service-account identity   |
| Enterprise Managed Authorization | `io.modelcontextprotocol/enterprise-managed-authorization` | supported (policy hook) | Default adapter is deny-unless-configured + allowlist-based                   |

## Renaming the Template

To replace the `@template` scope with your own:

```sh
bun scripts/rename.ts @mycompany/my-app
bun install
```

This updates all `@template/` references across the codebase. Run `bun install` afterward to regenerate the lockfile.

## Deployment

### Railway

The template uses `adapter-node` for Railway deployment:

1. Run the setup wizard with Railway enabled, or manually:

   ```sh
   railway init
   railway up
   ```

2. Set environment variables in the Railway dashboard — same variables as `.env.local`, but with production values. `BETTER_AUTH_URL` is auto-derived from `RAILWAY_PUBLIC_DOMAIN` if unset.
3. Enable sticky routing/session affinity for MCP traffic so requests consistently land on the session owner instance.
4. Set `MCP_ALLOWED_ORIGINS` to your production host origin(s), and ensure enterprise policy variables are configured if enterprise authorization is enabled.

The default Neon region is `aws-us-east-2` (Ohio). Choose a region close to your Railway deployment for lower latency.

### CI/CD

Two GitHub Actions workflows are included:

- **Pull Request** — Runs typecheck, lint, test, build, and MCP server conformance (`@modelcontextprotocol/conformance` at spec `2025-11-25`). Validates the database schema against a temporary Neon branch.
- **Production** — Runs migrations on push to `main`.
  Conformance is enforced with a zero-baseline policy: no expected-failures file is used in CI.

### Registry Manifest

A `server.json` registry descriptor is included at the repository root. Update the placeholder domain values before publishing.

Required GitHub secrets:

| Secret                  | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `NEON_PROJECT_ID`       | Neon project ID (for PR branch creation)             |
| `NEON_API_KEY`          | Neon API key (for PR branch creation)                |
| `DATABASE_URL`          | Production pooled connection string (for migrations) |
| `DATABASE_URL_UNPOOLED` | Production direct connection string (for migrations) |

The setup wizard can configure these automatically via `gh secret set`.

## License

MIT
