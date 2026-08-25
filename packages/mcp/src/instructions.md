This is a Model Context Protocol (MCP) server built from the Bun + Svelte MCP Template. It exposes read-only account tools, a JSON resource, and a summarization prompt over Streamable HTTP, secured by OAuth 2.1 with PKCE. Every call must carry a bearer token issued through this server's own /oauth/authorize and /oauth/token endpoints; there is no anonymous or service-account access. Every operation acts only on the authenticated caller's own account.

## Available capability families

- **Tools** — `get_user_profile` is read-only and idempotent. It returns the authenticated caller's own id, email, name, avatar image, and role. It never accepts a target user identifier and never reads or modifies another account.
- **Resources** — `user_profile` (`user://profile`) exposes the same caller-scoped profile as a JSON document, for clients that prefer reading a resource over calling a tool.
- **Prompts** — `summarize` builds a reusable "summarize this topic" message for the authenticated caller, given a `topic` argument.

## Authentication and boundaries

Every request to `/mcp` requires a bearer token obtained through this server's own OAuth authorization code flow with PKCE (`S256`). Tokens are scoped to the account that authorized them; there is no way to act as, or read data belonging to, a different user through any tool, resource, or prompt in this template's default set. None of the default operations are destructive — nothing here deletes or overwrites account data. Rate limits apply to every endpoint; a client that exceeds them receives `429` with a `Retry-After` header rather than a silent failure.

## Workflow examples

To identify the current user before personalizing a response, call the tool directly:

```
tools/call { "name": "get_user_profile", "arguments": {} }
```

To read the same data as a resource instead of a tool call:

```
resources/read { "uri": "user://profile" }
```

To ask the assistant to summarize a topic on the caller's behalf:

```
prompts/get { "name": "summarize", "arguments": { "topic": "quarterly revenue trends" } }
```
