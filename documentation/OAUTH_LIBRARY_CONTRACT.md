# OAuth Library Contract

The OAuth library owns protocol behavior while the host supplies the things only an application can know: who the requester is, where durable records live, how consent renders, which scopes exist, which policy values apply, and whether messages can cross process boundaries. Keeping that split explicit lets a [SvelteKit](https://svelte.dev/docs/kit) application embed the server without importing [Protokit](https://github.com/stevekinney/protokit)'s session model, database driver, [Redis](https://redis.io/) client, or user interface.

Consumers import the host contract from `@lostgradient/mcp/oauth` and the four storage interfaces from `@lostgradient/mcp/oauth/stores`.

## Request and identity

`OAuthRequestContext` carries the request, parsed URL, request identifier, immediate socket peer, and optional resolved identity. The socket peer must be the address reported by the network connection—not a value an adapter already derived from `Forwarded` or `X-Forwarded-For`. The library combines that peer with the request headers and `TrustedProxyConfiguration`, so the trust decision stays in one implementation.

`ResolveIdentityBinding` returns both the durable subject identifier used for grant attribution and a host-chosen opaque consent binding. Protokit can bind consent to one browser session while another host binds it to an account. The library compares the consent binding but never parses it, joins through it, or assumes which granularity the host chose.

`HandleUnauthenticatedAuthorization` receives the original authorization request when identity resolution returns `null`. The host can redirect into its own sign-in flow while preserving the complete authorization callback; the library never hardcodes an application authentication route.

## Consent

`RenderConsent` receives either an error or the complete prompt presentation and returns a `Response`. A prompt includes the transaction identifier, verified redirect URI, authenticated requester's public `McpUserProfile`, and the one-time plaintext CSRF token that approve and deny forms must submit; only its hash is persisted. The public profile lets the renderer identify the account granting access without depending on request-local ambient state or exposing a host-private user record.

The library owns approve and deny behavior. The host owns rendering.

## Storage

`TransactionStore`, `CodeStore`, `TokenStore`, and `ClientStore` remain separate because their lifetimes and reasonable backing stores differ. `OAuthStores` groups them when a consumer wants to pass the complete storage seam.

The method comments are part of the contract. Transaction and code consumption must be single-use under concurrency. The transaction store receives the opaque transaction identifier and both transaction secrets as plaintext at creation and owns their hashing, so creation and consumption cannot disagree about an undocumented digest algorithm; plaintext values are never retained in the public record. Transaction consumption must apply its identity, CSRF, expiry, and unused-record predicates atomically, and compensation may reopen only the exact consumption marker returned by that operation. Authorization-code records contain only `codeHash`; lookup, consume, and compensation all use that hash. Codes can be inspected for redirect URI and PKCE validation before the atomic consume, which independently enforces expiry at consumption time, and a failed token issuance may reopen only the exact code-consumption marker returned by that operation. Access-token, refresh-token, and confidential-client records likewise contain only explicitly named hashes. Initial token issuance stores an access token and optional root refresh token atomically. Refresh rotation derives inherited grant fields from the stored prior token, validates any requested scope narrowing before consumption, revokes the prior paired access token, returns `scope_rejected` for a recognized but excessive request, and discriminates a replay after atomically revoking its family. Per-token revocation is client-bound, revokes the paired credential, and likewise distinguishes replay-driven family revocation from an invalid token. Successful refresh-token revocation and replay-driven family revocation return the affected subject so `CrossInstanceMessaging` can disconnect that subject's live MCP streams. Refresh-family revocation revokes the family and all descendant access tokens without exposing an interleaving point. Client metadata refresh uses atomic upsert rather than a racy read-create sequence. A store that reads, checks, and then writes does not satisfy those guarantees even if it matches the [TypeScript](https://www.typescriptlang.org/) signature.

Deletion preserves the same identity boundary. `TransactionStore.deleteByBinding` compares the host-chosen consent binding for equality without parsing it, so Protokit can delete one revoked browser session while Tribunal can delete an account-bound transaction using the same contract. `deleteAllForUser` removes durable-subject state from transactions, codes, and tokens. It is deliberately absent from `ClientStore` because registered clients are not user-owned. The composite operation may rely on referential cascade in a relational adapter; stores without referential integrity must explicitly delete from all three user-owned stores.

Expiry cleanup is a host responsibility. The library exposes deterministic purge primitives that take `now`, but it starts no timer, acquires no cleanup lease, and does not choose a schedule. Token cleanup retains rotated refresh credentials until their own expiry so a replay remains detectable and can revoke the whole family. Client registrations have no purge primitive: `clientSecretExpiresAt` is enforced during authentication, and deleting an expired-secret row would destroy the registration instead of allowing credential rotation. A host that never invokes the purge primitives will accumulate expired records.

Record types use plain strings for host user identifiers and `Date` for timestamps. They do not import a database schema or carry foreign-key brands.

## Scopes

`defineOAuthScopeConfiguration` binds the `McpScopeVocabulary` returned by `defineScopes` to the supported scope set mechanically derived from the production registry. It infers the vocabulary's literal scope union, rejects an undeclared scope at compile time, validates membership again for JavaScript or widened inputs, and snapshots the supported list. The supported subset prevents conformance-only or otherwise unserved scopes from appearing in metadata or default consent.

## Policy and shared infrastructure

`OAuthConfiguration` supplies canonical URLs, access-token, refresh-token, and confidential-client-secret lifetimes, trusted-origin policy, trusted-proxy policy, all required OAuth and MCP rate-limit categories, the maximum concurrent operation count, MCP UI-extension deployment state, and optional backing stores. UI-extension metadata is advertised only when the host flag is enabled and the served registry contains a registered UI-extension resource, matching the MCP server capability predicate. The required rate-limit categories separately cover authorization, registration, token network and client admission, revocation, MCP network and user admission, and failed-authentication lockout, so a conforming host cannot silently omit a serving-layer policy. The library uses those lifetimes and limits rather than embedding deployment policy. The library owns limiter behavior; the host supplies policy values and atomic storage. `AtomicSlidingWindowStore` handles admission, while `ConcurrencySlotStore` holds named, renewable slots. They are different contracts because a request counted once and a stream held open for minutes have different lifetimes.

`resolveUserProfile` maps the durable subject on an authenticated access-token record to the host's complete `McpUserProfile`. It is separate from browser-session identity resolution because an arbitrary bearer token has no authorization-session context.

The optional key namespace isolates test runs that share a Redis instance. Production deployments normally omit it instead of weakening the real limits.

`MinimalRedisClient` is structural and names only the operations used by the library's Redis-backed store factories. A consumer can adapt another Redis client without importing the `redis` package's nominal client type into its public surface.

## Cross-instance messaging

`CrossInstanceMessaging` publishes messages and creates subscriptions that return an asynchronous unsubscribe function. A host with multiple replicas supplies a real implementation so subscription events and grant revocations reach the process holding the affected stream. When the seam is absent, the library operates as a single-instance server and must report that reduction at construction.

## Shared HTTP utilities

Consumers import the MCP HTTP serving contract from `@lostgradient/mcp/http`. `createMcpHttpServingLayer` owns the request order: network admission (skipped for `OPTIONS`), DNS-rebinding and origin checks, preflight handling, failed-authentication lockout, bearer validation, token lookup and audience validation, authenticated-subject validation, per-user admission, concurrency acquisition, and handler dispatch. A host supplies policy values, storage, rate-limit and concurrency seams, the raw socket identity, and its registry; it must not repeat or reorder those protocol checks in its route adapter.

`createMcpServingHandler` owns request-body bounds, modern and legacy protocol dispatch, subscription-scope checks against the injected registry, per-user handler reuse, cross-instance resource events, and grant-revocation stream closure. Unknown and under-scoped subscription URIs share the same response, while observability records the internal outcome. The authorization helper remains internal to the package so consumers cannot assemble a second authentication path from lower-level pieces.

The handler cache is bounded by idleness rather than a numeric entry ceiling. Idle entries without a live listener are evicted and closed; entries with an active listen stream remain until the stream ends, the grant is revoked, the user is explicitly closed, or the host shuts down. A numeric ceiling would require evicting a live authorized listener under load, so the contract deliberately does not provide one.

Protocol CORS headers and bounded request-body handling belong to this serving layer. Host routes that also need those utilities import the package implementation; neither side keeps a second copy. The package answers allowed `OPTIONS` requests before authentication, while the outer serving layer skips only network admission for that method so preflight behavior remains in one ordered path.

Trusted-proxy resolution follows the same ownership rule. The host supplies the raw socket peer and policy, and the library owns the security-sensitive resolution algorithm. Do not configure an adapter to replace the socket peer with a client-controlled forwarding header before the library sees it.
