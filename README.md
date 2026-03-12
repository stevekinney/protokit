# Bun + React MCP Template

A production-ready template for building [Model Context Protocol](https://modelcontextprotocol.io) servers with Bun and React, featuring OAuth 2.0 + PKCE, Google sign-in, and Railway deployment.

## What You Get

- MCP server at `/mcp` using Streamable HTTP transport
- OAuth authorization server with:
  - `/oauth/register` (dynamic client registration)
  - `/oauth/authorize` (user consent)
  - `/oauth/token` (code/token exchange)
- Google OAuth sign-in (`/auth/google/start`, `/auth/google/callback`)
- Postgres via Neon + Drizzle ORM
- Redis-backed MCP session ownership and rate limiting
- Tailwind v4 styling for server-rendered React pages
- Monorepo with Bun + Turborepo

## Project Structure

```text
applications/web/          Bun + React SSR app (UI + OAuth + MCP transport)
packages/database/         Drizzle schema, migrations, shared database client
packages/mcp/              MCP server factory, tool definitions, shared logger
scripts/                   Setup wizard, migration runner, scope renamer
```

## Quick Start

1. Install dependencies:

```sh
bun install
```

2. Create `.env.local` in repository root:

```sh
DATABASE_URL=<pooled connection string>
DATABASE_URL_UNPOOLED=<direct connection string>
REDIS_URL=<redis connection string>
BETTER_AUTH_SECRET=<random string, at least 32 characters>
GOOGLE_CLIENT_ID=<google oauth client id>
GOOGLE_CLIENT_SECRET=<google oauth client secret>
MCP_ALLOWED_ORIGINS=http://localhost:3000
```

3. Run migrations:

```sh
bun turbo db:generate
bun scripts/migrate.ts
```

4. Start development:

```sh
bun turbo dev
```

The web server runs on `http://localhost:3000`.

## Environment Variables

Required in `applications/web`:

- `BETTER_AUTH_SECRET` (used as session/signing secret)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `REDIS_URL`
- `MCP_ALLOWED_ORIGINS`

Optional:

- `SESSION_COOKIE_NAME` (default `application_session`)
- `SESSION_TIME_TO_LIVE_SECONDS` (default `2592000`)
- `RATE_LIMIT_REGISTER_MAX` (default `10`)
- `RATE_LIMIT_REGISTER_WINDOW_SECONDS` (default `60`)
- `RATE_LIMIT_TOKEN_MAX` (default `30`)
- `RATE_LIMIT_TOKEN_WINDOW_SECONDS` (default `60`)
- `MCP_PROTOCOL_VERSION` (default `2025-11-25`)
- `MCP_ENABLE_UI_EXTENSION` (default `true`)
- `MCP_ENABLE_CLIENT_CREDENTIALS` (default `true`)
- `MCP_ENABLE_ENTERPRISE_AUTH` (default `true`)
- `MCP_CONFORMANCE_MODE` (default `false`)

## Commands

```sh
bun turbo dev
bun turbo build
bun turbo typecheck
bun turbo lint
bun turbo format
bun turbo test
bun turbo db:generate
bun turbo db:validate
```

## Testing

- `applications/web` uses `bun:test`
- `packages/database` uses `bun:test`
- `packages/mcp` uses `bun:test`

Run all tests with:

```sh
bun turbo test
```

## Deployment

### Railway

- Dockerfile builds with Bun and runs Bun in production.
- `railway.toml` starts the server with:

```sh
bun applications/web/dist/server.js
```

### CI

- Pull request workflow runs typecheck, lint, test, build, and MCP conformance checks.
- Production workflow runs database migrations on `main`.

## Registry Manifest

`server.json` includes a registry descriptor. Update placeholder domain values before publishing.

## License

MIT
