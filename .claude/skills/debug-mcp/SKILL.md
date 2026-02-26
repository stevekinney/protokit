# Skill: Debug MCP

Debug the MCP server using Cloudflare Tunnel and MCP Inspector.

## Workflow

1. Start the dev server: `bun turbo dev`
2. In a second terminal, start the tunnel: `bunx cloudflared tunnel --url http://localhost:3000/mcp`
3. Copy the tunnel URL (e.g., `https://random-name.trycloudflare.com/mcp`)
4. Open MCP Inspector: `bunx @modelcontextprotocol/inspector`
5. In the inspector, connect using the tunnel URL
6. Test the OAuth flow: register client → authorize → get token
7. Call tools and verify responses

## Common Issues

- **401 Unauthorized**: Check that the Bearer token is valid and not expired
- **Session not found (404)**: The session may have been lost due to server restart. In-memory transport Map clears on restart.
- **PKCE validation failed**: Ensure `code_verifier` and `code_challenge` match using S256
- **Well-known metadata mismatch**: Verify URLs in `/.well-known/oauth-authorization-server` match actual endpoints

## Checking Logs

The MCP server logs via pino. In development, logs are pretty-printed to stdout.
Look for `component: 'mcp-handler'` entries to trace MCP session lifecycle.
