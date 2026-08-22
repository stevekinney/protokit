# ChatGPT plugin review evidence

This is the `DIST-002` evidence document: what this repository can prove about OpenAI's MCP
plugin/app review requirements without a live deployment, mapped file-by-file to the tests that
prove it, and what genuinely needs a production URL or a real ChatGPT organization/login — named
exactly, not silently skipped. Same boundary as `DIST-001` (Claude connector directory evidence):
this repository has no live deployment anywhere in its history (confirmed by `OPS-001`), so every
box below that says "production only" stays an explicit, ready-to-run harness or manual procedure,
never a claim on partial evidence.

Owner boundary: this document and `packages/mcp/src/golden-prompts.ts`/`.test.ts` are `DIST-002`'s
files. `CONNECTORS.md`, `README.md`, `server.json.example`, and Claude-specific evidence belong to
`DOCS-001`/`DIST-001` and are referenced here, not edited.

## Sources

OpenAI's MCP/Apps SDK documentation was fetched directly for this document rather than recalled
from training data (this repository's own convention: verify every API claim against primary
documentation before publishing it). Retrieved 2026-08-21:

- [Deploy your app – Apps SDK](https://developers.openai.com/apps-sdk/deploy) — production endpoint, authentication, security/privacy, domain verification, tool metadata, and review-process requirements.
- [Reference – Apps SDK](https://developers.openai.com/apps-sdk/reference) — tool annotations, `outputSchema`, component CSP (`_meta.ui.csp`), `securitySchemes`, `_meta['mcp/www_authenticate']`.
- [Authentication – Plugins](https://developers.openai.com/plugins/build/auth) — OAuth 2.1, PKCE `S256`, `resource` parameter and audience binding, CIMD (preferred) and DCR, scopes.
- [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) — could not be fetched (`403`) from this environment; not relied on for any claim below. Anything about developer-mode connection procedure comes from `CONNECTORS.md`'s existing ChatGPT section instead, which `DOCS-001` already wrote and which carries its own "unverified against a live host" caveat.

OpenAI's own review criteria are stated to change over time — the same "record compliance
immediately before submission" caveat `DIST-001` carries applies here. Re-fetch these pages at
actual submission time rather than trusting this snapshot.

## Requirement coverage

### OpenAI organization verification and production plugin metadata

**Production only.** Organization verification is an OpenAI-side account action with no
API or CLI surface this repository can call — there is nothing to script. `server.json.example`
(`DOCS-001`/`CONTENT-001`'s file, referenced not edited here) is the template a real submission
copies to `server.json` and fills with the production domain; `scripts/audit-production-content.ts`
(`bun run audit:production-content`) already fails the build if the template's unfilled placeholder
domain or registry tokens remain in any `.md`/`.json` file — see that script for the exact patterns,
which are deliberately not spelled out here so this page does not trip the very guard it describes.
A submission built from an unfilled template is therefore caught mechanically before it ships, not
discovered during review. What's missing is a production
domain and an OpenAI organization to verify against — both created at deployment/submission time,
not something this branch can produce.

### OAuth discovery, PKCE, resource indicators, audience checks, CIMD/DCR, refresh, scopes, tool-level security schemes

Every one of these was already built and tested by earlier P0/P1 items; this item's job was to
verify the coverage against what OpenAI's docs actually require (fetched above), not add a fifth
parallel OAuth suite. Reusing `INTEROP-001`'s own coverage matrix, which maps each requirement to
its file and test:

| OpenAI requirement                                                                             | Verified by                                                                                                                                                                                                                                                                                                                                                                      | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OAuth 2.1 authorization-code + PKCE `S256`                                                     | `oauth-connector-registration.integration.test.ts`, `oauth-mcp-resource-binding.integration.test.ts`                                                                                                                                                                                                                                                                             | Real PKCE round-trip end to end; a non-`S256` or missing challenge is rejected (`pkce-validation.test.ts`, part of `test:request-boundaries`).                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `resource` parameter carried on authorize and token requests, copied into the token's audience | `oauth-mcp-resource-binding.integration.test.ts` — "rejects an authorization request whose resource does not name this server," "rejects a token request whose resource does not match the authorization code," "the same token is rejected at /mcp once its stored resource no longer matches"                                                                                  | RFC 8707 resource binding is enforced at every stage OpenAI's docs describe (authorize, token, and per-request verification), not just accepted and ignored.                                                                                                                                                                                                                                                                                                                                                                                                             |
| CIMD preferred, DCR available as fallback                                                      | `oauth-connector-registration.integration.test.ts` — "a valid CIMD document is fetched, validated, and upserted…", "a DCR public client (auth_method none) gets no secret, completes PKCE, rotates its refresh token exactly once, and cannot replay it"; `client_id_metadata_document_supported: true` on `/.well-known/oauth-authorization-server` (`oauth-discovery.test.ts`) | Both registration paths OpenAI's docs name work; CIMD is the one advertised as supported, matching "use CIMD as the preferred method when your authorization server supports it."                                                                                                                                                                                                                                                                                                                                                                                        |
| Refresh tokens, rotation                                                                       | `oauth-token-rotation-revocation.integration.test.ts` — "at most one of two concurrent refresh attempts… succeeds," "reuse of a rotated refresh token revokes its whole token family"                                                                                                                                                                                            | Refresh-token reuse detection and family revocation, not merely "a refresh token is issued."                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Scopes published and enforced                                                                  | `scopes.ts`/`supported-scopes.ts` back `scopes_supported` on both discovery documents (`oauth-discovery.test.ts`); `AUTHZ-001`'s per-operation `requiredScope` enforcement (`metadata-contract.test.ts`, `oauth-mcp-resource-binding.integration.test.ts` — "a real narrowed-scope token authenticates at /mcp but is refused insufficient_scope for a tool outside its grant")  | Scopes are real, published, and load-bearing at the point of tool invocation — not decorative.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Token signature/issuer/expiration/audience verification before executing a tool                | `oauth-mcp-resource-binding.integration.test.ts`; `routes/oauth-discovery.test.ts` — canonical issuer, spoofed-`Host` resistance (RFC 9207 `iss`, `OAUTH-004`)                                                                                                                                                                                                                   | Every dimension OpenAI's auth doc names ("verify token signature, issuer, expiration, and audience before executing tools") is checked before a handler runs, not just at token mint time.                                                                                                                                                                                                                                                                                                                                                                               |
| Tool-level security scheme signaling                                                           | `_meta['mcp/www_authenticate']` (RFC 6750-shaped `Bearer error="insufficient_scope", scope="…"` challenge), attached on every under-scoped tool/resource/prompt call — see `packages/mcp/src/server.ts`'s `insufficientScopeChallenge`                                                                                                                                           | OpenAI's reference docs describe a `securitySchemes` field on `Tool` for this; `server.ts`'s own comment records that the installed `@modelcontextprotocol/server@2.0.0` SDK has no typed `securitySchemes` field to populate, so this server uses the documented fallback mechanism — the RFC 7235 challenge in `_meta['mcp/www_authenticate']`, which OpenAI's own reference page independently documents as the channel that "triggers OAuth flows." This is the SDK's real current surface, verified against its installed type definitions, not a gap papered over. |

Run locally: `bun run test:oauth:interop` (23 pass at last clean run — see `INTEROP-001`'s progress
file for the one unrelated, already-diagnosed failure mode tied to a concurrent migration).
**Production only**: re-run every test above's live equivalent against the deployed host —
`bun run test:deployed-oauth -- https://HOST` (`OPS-001`'s harness) exercises DCR, a negative
token-exchange path, and prints the manual browser-consent steps needed to obtain a real bearer
token; there is no way to script ChatGPT's own OAuth client the way `test:connector:codex`/
`test:connector:claude-code` do (no CLI exists for ChatGPT — see `CONNECTORS.md`'s "ChatGPT
(developer mode)" section for the manual procedure).

### Golden-prompt evaluation set

**Fully local, done.** `packages/mcp/src/golden-prompts.ts` is a 12-case set covering all five
categories OpenAI's review process (and this item's own acceptance criterion) names — intended tool
use, disallowed tool use, parameter extraction, authentication interruption, and safe handling of
untrusted content. `packages/mcp/src/golden-prompts.test.ts` (`bun run test:golden-prompts`, 7 pass
locally) proves the set stays honest relative to the real server: every referenced tool/resource/
prompt genuinely exists in the production registry (`allTools`/`allResources`/`allPrompts` —
`list_audit_events`, the conformance-only fixture, is proven absent, not just unreferenced), every
expected parameter is derived from that operation's real Zod input shape (never hand-duplicated, so
a renamed parameter breaks this test instead of silently going stale), every disallowed-use case
names no reachable operation, and every case carries a real prompt string and a real expected-
behavior description.

What this set cannot do locally: actually run each prompt through ChatGPT and record the model's
real behavior. That is the manual step OpenAI's own review process performs — "connect to ChatGPT
in developer mode to validate representative and edge-case requests from your use-case inventory."
**Production only**: once a host and a ChatGPT developer-mode connection exist, run every prompt in
`goldenPrompts` verbatim, record the transcript (tool called, parameters extracted, and whether
behavior matched each case's `expectedBehavior`) per case, and attach the transcripts to the
submission — `golden-prompts.ts`'s own `id` field exists so each transcript can cite exactly which
case it satisfies.

### Tool descriptions, annotations, result schemas, component CSP, privacy policy, support information

- **Descriptions, annotations, result schemas**: `packages/mcp/src/metadata-contract.test.ts`
  (`bun run test:metadata`) already proves every production tool has a title, an outcome-focused
  description, all four required annotation hints (with the readOnly/destructive mutual-exclusion
  rule enforced), and — where declared — an `outputSchema` that validates the handler's real
  `structuredContent` (not a hand-written duplicate assertion). `META-001`'s progress file has the
  full build history; nothing here needed to change for this item, only verifying it against
  OpenAI's specific wording ("action-oriented names," "explicit input and output schemas," "accurate
  safety annotations") — confirmed line-by-line against `get_user_profile`'s real definition in
  `packages/mcp/src/tools/get-user-profile.ts`.
- **Component CSP (`_meta.ui.csp`)**: not applicable, proven rather than assumed. This repository
  ships no MCP App / UI component — `packages/mcp-apps` has no application under
  `src/applications/`, `bun turbo build`'s own `@template/mcp-apps:build` step reports "No
  applications found — nothing to build," and `MCP_ENABLE_UI_EXTENSION` defaults to `false`
  (`CONTENT-001`). Even when that flag is deliberately set to `true`, `server.ts`'s `experimental`
  capability gate additionally requires a registered resource whose `mimeType` matches the real MCP
  Apps UI resource marker before advertising the capability at all — verified by
  `extension-advertisement.test.ts`. Since no such resource exists, the capability stays absent on
  the wire either way, which is what makes "no component CSP applies" a proven fact about this
  registry rather than an assumption: there is no component for a CSP to govern.
- **Privacy policy and support information**: `/privacy`, `/terms`, and `/support` are real,
  unauthenticated routes with genuine content (real subprocessors, real retention language, an
  honest "not configured" notice when `SUPPORT_CONTACT_EMAIL` is unset rather than a fabricated
  address) — built by `DOCS-001`, proven by `oauth-metadata-links.test.ts` (9 pass), and linked from
  both OAuth metadata documents via RFC 8414/9728 fields. Referenced here, not re-verified with a
  duplicate test, since `DOCS-001` owns those files.

### Full automated and hosted-client matrix, on the exact submitted revision

This is inherently a re-run-at-submission-time step — "the exact submitted revision" cannot mean
anything before a revision is actually chosen for submission. What can be stated now is the
complete list of commands that constitute the matrix, so re-running it at submission time is
mechanical rather than reconstructed from memory:

```sh
bun turbo typecheck lint test build --force
bun run test:oauth:interop
bun run test:golden-prompts
bun run test:metadata
bun run test:conformance:modern
bun run test:conformance:legacy
bun run test:connector:inspector
bun run test:deployed-smoke -- https://HOST
bun run test:deployed-oauth -- https://HOST
bun run test:deployed-streaming -- https://HOST/mcp --token TOKEN
```

Plus the two manual, unscriptable steps: MCP Inspector (`bunx @modelcontextprotocol/inspector@2.3.0`,
per `scripts/setup.ts`'s pinned instruction) against the submitted `https://HOST/mcp`, and a real
ChatGPT developer-mode connection running every case in `golden-prompts.ts` and recording the
transcript, per the golden-prompt section above.

## Acceptance criteria

- [ ] Complete OpenAI organization verification and production plugin metadata. **Production only**
      — no API/CLI surface exists to script organization verification; `server.json.example` and
      `audit:production-content` are ready for the moment a real domain exists.
- [ ] Validate OAuth discovery, PKCE, resource indicators, audience checks, CIMD or DCR, refresh
      behavior, scopes, and tool-level security schemes against the production URL. **Partially
      local, remainder production-only** — every mechanism is implemented and tested locally (see
      the coverage table above); "against the production URL" specifically needs a deployed host
      (`bun run test:deployed-oauth -- https://HOST`).
- [x] Create a golden-prompt evaluation set covering intended and disallowed tool use, parameter
      extraction, authentication interruption, and safe handling of untrusted content. Fully local:
      `packages/mcp/src/golden-prompts.ts` (12 cases, all 5 categories), proven in sync with the
      production registry by `bun run test:golden-prompts` (7 pass).
- [ ] Verify tool descriptions, annotations, result schemas, component CSP when applicable, privacy
      policy, and support information. **Partially local, one item production-only** — descriptions/
      annotations/result schemas/component-CSP-not-applicable/privacy/support are all verified
      locally against real, passing tests (see the section above); this box stays unticked as a
      whole because OpenAI's "Scan Tools" submission-portal step (which validates file schemas
      server-side) has no local equivalent to run against — it exists only inside a real submission.
- [ ] Re-run the full automated and hosted-client matrix on the exact submitted revision.
      **Production only** by definition — "the exact submitted revision" doesn't exist until a
      revision is chosen for submission. The exact command list is above, ready to run then.
