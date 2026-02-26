# SvelteKit MCP Template

A production-ready template for building [Model Context Protocol](https://modelcontextprotocol.io) servers with SvelteKit, featuring OAuth 2.0 with PKCE, Google authentication via Neon Auth, and Railway deployment.

## What You Get

- **MCP Server** — Streamable HTTP transport at `/mcp`, authenticated via OAuth Bearer tokens
- **OAuth 2.0 + PKCE** — Full authorization server with dynamic client registration (RFC 7591), token exchange (RFC 6749), and S256 code challenges (RFC 7636)
- **Google Sign-In** — Via Neon Auth (Better Auth under the hood), works immediately with shared dev credentials
- **Postgres** — Neon serverless Postgres with Drizzle ORM, schema migrations, and CI validation
- **Monorepo** — Turborepo with three packages, Bun as the package manager

## Project Structure

```
applications/web/          SvelteKit app — UI, OAuth endpoints, MCP transport
packages/database/         Drizzle schema, migrations, shared database client
packages/mcp/              MCP server factory, tool definitions, shared logger
scripts/                   Setup wizard, migration runner, scope renamer
```

### Key Files

| File                                              | Purpose                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `applications/web/src/hooks.server.ts`            | Dual auth — Bearer tokens for `/mcp`, Neon Auth sessions for everything else |
| `applications/web/src/lib/mcp-handler.ts`         | In-memory MCP transport management with session eviction                     |
| `applications/web/src/routes/mcp/+server.ts`      | GET/POST/DELETE handlers for Streamable HTTP                                 |
| `applications/web/src/routes/token/+server.ts`    | OAuth code-to-token exchange with PKCE validation                            |
| `applications/web/src/routes/authorize/`          | OAuth consent page (requires authenticated session)                          |
| `applications/web/src/routes/register/+server.ts` | Dynamic client registration (RFC 7591)                                       |
| `packages/mcp/src/server.ts`                      | `createMcpServer(context)` factory — register tools here                     |
| `packages/mcp/src/tools/get-user-profile.ts`      | Example MCP tool — returns the authenticated user's profile                  |
| `packages/database/src/schema.ts`                 | All table definitions (OAuth clients, codes, tokens, MCP sessions)           |

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
2. Enable Neon Auth and write `NEON_AUTH_URL` to `.env.local`
3. Optionally configure production Google OAuth credentials
4. Optionally initialize a Railway project and sync environment variables
5. Optionally set GitHub secrets for CI/CD
6. Run the initial database migration

### Manual Setup

1. **Install dependencies**

   ```sh
   bun install
   ```

2. **Create a Neon project** and enable Neon Auth:

   ```sh
   neonctl projects create --region-id aws-us-east-2
   neonctl auth enable --project-id <your-project-id>
   ```

3. **Create `.env.local`** in the project root:

   ```sh
   # Required
   DATABASE_URL=<pooled connection string from Neon>
   PUBLIC_APP_URL=http://localhost:3000
   NEON_AUTH_URL=<from: neonctl auth url --project-id YOUR_PROJECT_ID>

   # Required for migrations (falls back to DATABASE_URL if not set)
   DATABASE_URL_UNPOOLED=<direct connection string from Neon>

   # Optional — Neon Auth provides shared Google dev credentials automatically
   GOOGLE_CLIENT_ID=<your Google OAuth client ID>
   GOOGLE_CLIENT_SECRET=<your Google OAuth client secret>

   # Optional — defaults shown
   MCP_TOKEN_TTL_SECONDS=3600
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

| Variable         | Package              | Description                   |
| ---------------- | -------------------- | ----------------------------- |
| `DATABASE_URL`   | `@template/database` | Neon pooled connection string |
| `PUBLIC_APP_URL` | `@template/web`      | Public URL of the application |
| `NEON_AUTH_URL`  | `@template/web`      | Neon Auth endpoint URL        |

### Optional

| Variable                | Package              | Default       | Description                                                         |
| ----------------------- | -------------------- | ------------- | ------------------------------------------------------------------- |
| `DATABASE_URL_UNPOOLED` | `@template/database` | —             | Direct connection string (used for migrations)                      |
| `GOOGLE_CLIENT_ID`      | `@template/web`      | —             | Google OAuth client ID for production                               |
| `GOOGLE_CLIENT_SECRET`  | `@template/web`      | —             | Google OAuth client secret for production                           |
| `MCP_TOKEN_TTL_SECONDS` | `@template/mcp`      | `3600`        | OAuth access token lifetime in seconds                              |
| `LOG_LEVEL`             | `@template/mcp`      | `info`        | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) |
| `NODE_ENV`              | `@template/mcp`      | `development` | `development`, `production`, or `test`                              |
| `SKIP_ENV_VALIDATION`   | all                  | —             | Set to `true` to skip Zod validation (used in CI)                   |

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

2. Set environment variables in the Railway dashboard — same variables as `.env.local`, but with production values (`PUBLIC_APP_URL` should point to your Railway domain).

The default Neon region is `aws-us-east-2` (Ohio). Choose a region close to your Railway deployment for lower latency.

### CI/CD

Two GitHub Actions workflows are included:

- **Pull Request** — Runs typecheck, lint, test, and build. Validates the database schema against a temporary Neon branch.
- **Production** — Runs migrations on push to `main`.

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
