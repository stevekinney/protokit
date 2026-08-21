# Connecting an MCP Client

This is the `DOCS-001` connector guide: exact, verified setup and removal commands for every host
product this repository targets, plus the capabilities, scopes, rate limits, and result-size limits
a connected client should expect. Every command below is either copied directly from a ready-to-run
smoke harness this repository ships (`applications/web/src/connector-smoke-codex.ts`,
`connector-smoke-claude-code.ts`, run as `bun run test:connector:codex` /
`bun run test:connector:claude-code`) or flagged explicitly as a manual, browser-driven step this
repository cannot script. Where a step needs a real deployed `https://HOST`, that is stated plainly
— nothing below is verified against a production deployment from inside this repository, because
this repository does not have one.

Submitting this server to Anthropic's Claude connector directory has its own, larger evidence
package — `CLAUDE-CONNECTOR-SUBMISSION.md` (`DIST-001`) — mapping every documented submission
requirement and pre-submission checklist item to the specific file, test, or command that proves it,
including a new `bun run test:connector:inspector` harness that runs the real, pinned MCP Inspector
CLI against this server.

## Discovery, in one command

Every client below discovers this server the same way, starting from three documents:

```sh
curl -s https://HOST/.well-known/oauth-authorization-server | jq
curl -s https://HOST/.well-known/oauth-protected-resource/mcp | jq
```

`client_id_metadata_document_supported: true` in the first response is what tells a CIMD-aware
client to prefer a Client ID Metadata Document over dynamic registration; `mcp_protocol_version` in
the second names the current protocol revision this server serves by default.

## Claude Code

Verified end to end by `bun run test:connector:codex`'s sibling harness,
`bun run test:connector:claude-code`, against a locally self-hosted instance of this server (or a
real `--host https://HOST` if you have one deployed) — installs no configuration outside an isolated
`CLAUDE_CONFIG_DIR`, and always removes the connector it added, in a `finally`, whether or not the
run succeeds.

Add the connector:

```sh
claude mcp add --transport http protokit https://HOST/mcp
```

Complete the browser OAuth flow (Google sign-in, then this server's own consent screen — this step
cannot be scripted, by design; see `THREAT-MODEL.md`'s "Browser authorization" section for why):

```sh
claude mcp login protokit
```

Confirm it's registered, then use it:

```sh
claude mcp get protokit
claude -p "use the protokit MCP server's get_user_profile tool"
```

Remove it:

```sh
claude mcp remove protokit
```

## Codex CLI

Verified end to end by `bun run test:connector:codex` against a locally self-hosted instance of this
server (or `--host https://HOST`) — installs no configuration outside an isolated `CODEX_HOME`, and
always removes the connector it added. `codex mcp add` probes the URL immediately and starts the
interactive OAuth flow itself the moment it detects this server requires authentication; there is no
flag that defers that to a separate step.

```sh
codex mcp add protokit --url https://HOST/mcp
codex mcp login protokit --oauth-client-registration cimd
codex mcp get protokit --json
codex exec --json "call get_user_profile on protokit"
codex mcp remove protokit
```

`--oauth-client-registration cimd` requests the Client ID Metadata Document flow this server
advertises; `--oauth-client-registration auto` lets Codex choose (it prefers CIMD when the server
advertises it, matching this server's behavior). Both are real, documented Codex CLI flags — neither
is invented for this guide.

## Codex desktop

Codex desktop reads the same `~/.codex/config.toml` the CLI writes, so a server added with
`codex mcp add` (above) is also available in Codex desktop without a separate step. Codex desktop's
own settings UI additionally supports adding a server directly; that UI flow has not been exercised
against this server from inside this repository (no desktop application runs in this environment) —
treat it as equivalent to the CLI flow above until verified against a real deployment and a real
desktop install.

## Claude (hosted connector)

No CLI exists for this — adding a custom connector to Claude's hosted product is a browser flow with
no automatable equivalent, and this repository has no live deployment to test it against. The
manual procedure, to run once a real `https://HOST` exists:

1. Deploy the current revision and confirm `GET https://HOST/health` returns `{"status":"ok"}`.
2. In Claude, add a custom connector pointing at `https://HOST/mcp`.
3. Complete the OAuth flow — Google sign-in, then this server's own consent screen naming the exact
   scopes being granted.
4. Invoke `get_user_profile` and confirm it returns your account's real profile fields.
5. To remove it later, remove the connector from Claude's own connector settings, and separately
   revoke its access from this server's account page (or `POST /oauth/revoke`) so its issued tokens
   stop working even if Claude's own removal step is incomplete.

As of this writing, Claude's hosted connector documentation lists `2025-11-25` as its newest
supported MCP protocol revision — this server's legacy lane (see `README.md`/`ARCHITECTURE.md`)
exists specifically to keep serving that revision until Anthropic documents `2026-07-28` support.

## ChatGPT (developer mode)

Also a browser flow with no CLI. Manual procedure:

1. Deploy the current revision and confirm `GET https://HOST/health` returns `{"status":"ok"}`.
2. In ChatGPT developer mode, add `https://HOST/mcp` as an MCP server.
3. Complete the OAuth flow.
4. Invoke `get_user_profile` and confirm the real result.
5. Remove the connector from ChatGPT's own settings, and revoke its access from this server's
   account page or `POST /oauth/revoke` the same way as the Claude hosted procedure above.

## What every client should expect

### Scopes

This server's least-privilege scope vocabulary (`AUTHZ-001`) is small and grows only with real
capability families, not per tool: `profile:read` (the `get_user_profile` tool and `user://profile`
resource), `prompts:read` (the `summarize` prompt). A third scope, `audit:read`, exists only for
protocol-conformance testing and is never advertised or grantable through the real OAuth flow. The
consent screen names every scope a client is about to be granted in plain language before
authorization completes; an omitted `scope` parameter at authorize time defaults to every scope this
server's registry currently supports, so a client that doesn't ask for scopes explicitly still gets
exactly what the registry exposes, no more.

An under-scoped call is rejected at the point of invocation, not silently degraded: a tool call
returns `isError: true` with `_meta['mcp/www_authenticate']` naming the missing scope; a resource
read or prompt get throws a JSON-RPC `-32001` error carrying the same information. `tools/list`
itself is never filtered by scope, so discovery always shows the full registry.

### Rate limits

Every OAuth and `/mcp` route is rate-limited (`SEC-003`) — registration, authorization, token
exchange, and revocation each get their own window (typically 10–30 requests per 60 seconds by
default); `/mcp` itself defaults to 60 requests per 60 seconds per authenticated user plus a
10-concurrent-request cap. A rate-limited request gets `429 Too Many Requests` with a `Retry-After`
header computed from the real sliding window — back off and retry rather than treating it as a hard
failure. See `ARCHITECTURE.md`'s Rate Limiting table and `.env.example` for the exhaustive, current
list of limits and how an operator can adjust them.

### Result size limits

A tool result is capped at 256KB of serialized content (`packages/mcp/src/tool-response.ts`) — a
tool that would exceed this returns a text-only error result instead of a truncated or malformed
structured payload. Request bodies are similarly bounded per endpoint (`/mcp` JSON-RPC bodies up to
1MB, OAuth bodies far smaller — see `applications/web/src/lib/request-limits.ts`), rejected before
any handler or database write runs.

### Unsupported host capabilities

This server's advertised MCP capabilities describe only what it genuinely implements
(`META-001`) — a client should not expect any of the following, because the server does not
advertise them in production: server-initiated `sampling/createMessage` requests, `elicitation/*`
requests, `logging/setLevel`/`notifications/message` outside protocol-conformance test mode,
`listChanged` notifications on tools/resources/prompts (this registry does not change at runtime),
or `resources/subscribe` (registered internally for future use but not advertised as a capability,
since nothing currently delivers a cross-instance `notifications/resources/updated` push — see
`packages/mcp/CLAUDE.md`'s note on this). A host that gracefully treats an unadvertised capability
as absent needs no special handling here; one that assumes every server implements the full
capability surface will see accurate, minimal advertisements rather than an unfulfilled promise.

## Privacy, terms, and support

Every client above can discover this server's privacy policy, terms of service, and support contact
from the metadata documents themselves — `service_documentation`/`op_policy_uri`/`op_tos_uri` on
authorization server metadata (RFC 8414) and `resource_documentation`/`resource_policy_uri`/
`resource_tos_uri` on protected-resource metadata (RFC 9728), all pointing at `/support`, `/privacy`,
and `/terms` on this server's own canonical origin. See `README.md`'s "Privacy, Terms, and Support"
section.
