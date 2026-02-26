# SvelteKit MCP Template

A production-ready SvelteKit monorepo template for building MCP servers with OAuth authentication, targeting Claude's custom connector flow.

## Stack

- **Framework:** SvelteKit with `adapter-node`
- **Runtime:** Bun
- **Database:** Neon Postgres with Drizzle ORM
- **Auth:** Neon Auth (managed Better Auth) with Google login
- **MCP:** Streamable HTTP transport via `@modelcontextprotocol/sdk`
- **Deployment:** Railway
- **Monorepo:** Turborepo

## Quick Start

```bash
# 1. Clone and rename
git clone <repo-url> my-app && cd my-app
bun scripts/rename.ts @acme/my-app

# 2. Install dependencies
bun install

# 3. Run setup wizard (creates Neon project, populates .env.local)
bun scripts/setup.ts

# 4. Generate initial migration
bun turbo db:generate

# 5. Apply migration
bun scripts/migrate.ts

# 6. Start development server
bun turbo dev
```

## MCP Testing

```bash
# In a second terminal — expose MCP server for Claude
bunx cloudflared tunnel --url http://localhost:3000/mcp

# Debug MCP locally
bunx @modelcontextprotocol/inspector
```

Add the tunnel URL as a custom MCP connector in claude.ai to test the full OAuth flow.

## Project Structure

```
applications/web/     SvelteKit app (UI + OAuth + MCP transport)
packages/database/    Drizzle schema, migrations, DB client
packages/mcp/         MCP tool definitions + shared logger
scripts/              Setup wizard, rename, migrate
```

## Commands

| Command                 | Description                                  |
| ----------------------- | -------------------------------------------- |
| `bun turbo dev`         | Start development server on port 3000        |
| `bun turbo build`       | Build all packages and the web app           |
| `bun turbo typecheck`   | TypeScript type checking across all packages |
| `bun turbo lint`        | Run ESLint                                   |
| `bun turbo format`      | Run Prettier                                 |
| `bun turbo test`        | Run all tests                                |
| `bun turbo db:generate` | Generate Drizzle migrations                  |
| `bun turbo db:migrate`  | Apply migrations                             |
| `bun turbo db:validate` | Validate migrations match schema             |

## Deployment (Railway)

Railway auto-deploys via GitHub integration on push to `main`.

```bash
# Initial Railway setup (included in setup wizard)
railway init -y
railway variable set DATABASE_URL="..."
railway up
```

## Neon Region

The default Neon region is `aws-us-east-2` (Ohio). Change this during `bun scripts/setup.ts` or when creating a Neon project manually.

## OAuth Flow

The template implements OAuth 2.1 + PKCE for Claude's custom connector:

1. `GET /.well-known/oauth-authorization-server` — Discovery metadata
2. `POST /register` — Dynamic client registration
3. `GET /authorize` — User consent screen
4. `POST /token` — Code exchange with PKCE validation

## Adding MCP Tools

Create a new tool file in `packages/mcp/src/tools/`, register it in `server.ts`, and re-export from `index.ts`. See `.claude/skills/new-mcp-tool/SKILL.md` for the full pattern.
