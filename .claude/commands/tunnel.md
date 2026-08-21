Start a Cloudflare tunnel to expose the local MCP server for claude.ai testing.

CONFIG-001: never run `bunx cloudflared tunnel` directly against an already-running dev
server — that server was started without `PROTOKIT_TUNNEL_ACTIVE` set, which means
`/auth/dev/login` (the development login bypass) stays reachable over the tunnel. The
tunnel must always be started through `scripts/develop.ts --tunnel`, which starts the dev
server itself with that flag set, disabling the development login bypass and conformance
fixtures for the duration of the tunnel.

1. If a dev server is already running outside this flow, stop it first — this command
   needs to start its own.
2. Run `bun scripts/develop.ts --tunnel`
3. Print the tunnel URL and the exposed-routes banner it prints when it's ready
4. Remind the user to add the tunnel URL (with `/mcp` appended) as a custom MCP connector
   in claude.ai
