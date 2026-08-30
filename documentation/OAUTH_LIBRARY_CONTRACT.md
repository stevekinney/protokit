# OAuth Library Contract

The OAuth library owns protocol behavior while the host supplies the things only an application can know: who the requester is, where durable records live, how consent renders, which scopes exist, which policy values apply, and whether messages can cross process boundaries. Keeping that split explicit lets a [SvelteKit](https://svelte.dev/docs/kit) application embed the server without importing [Protokit](https://github.com/stevekinney/protokit)'s session model, database driver, [Redis](https://redis.io/) client, or user interface.

Consumers import the host contract from `@lostgradient/mcp/oauth` and the four storage interfaces from `@lostgradient/mcp/oauth/stores`.

## Request and identity

`OAuthRequestContext` carries the request, parsed URL, request identifier, immediate socket peer, and an optional identity binding. The socket peer must be the address reported by the network connection—not a value an adapter already derived from `Forwarded` or `X-Forwarded-For`. The library combines that peer with the request headers and `TrustedProxyConfiguration`, so the trust decision stays in one implementation.

`ResolveIdentityBinding` returns a host-chosen opaque string or `null`. Protokit can bind consent to one browser session while another host binds it to an account. The library compares the value but never parses it, joins through it, or assumes which granularity the host chose.

## Consent

`RenderConsent` receives either an error or the complete prompt presentation and returns a `Response`. The presentation intentionally contains no application user object: the host has already resolved identity, and handing its private user shape back through a public library contract would couple every consumer to one authentication model.

The library owns approve and deny behavior. The host owns rendering.

## Storage

`TransactionStore`, `CodeStore`, `TokenStore`, and `ClientStore` remain separate because their lifetimes and reasonable backing stores differ. `OAuthStores` groups them when a consumer wants to pass the complete storage seam.

The method comments are part of the contract. Transaction and code consumption must be single-use under concurrency. Transaction consumption must apply its identity, CSRF, expiry, and unused-record predicates atomically. Refresh-family revocation must revoke the family and its descendant access tokens without exposing an interleaving point. A store that reads, checks, and then writes does not satisfy those guarantees even if it matches the [TypeScript](https://www.typescriptlang.org/) signature.

Record types use plain strings for host user identifiers and `Date` for timestamps. They do not import a database schema or carry foreign-key brands.

## Scopes

`OAuthScopeConfiguration` accepts the `McpScopeVocabulary` returned by `defineScopes`. That keeps the consent descriptions, runtime membership check, and registry-bound definers tied to the same vocabulary instead of asking a host to maintain another scope list.

## Policy and shared infrastructure

`OAuthConfiguration` supplies canonical URLs, trusted-origin policy, trusted-proxy policy, rate-limit categories, and optional backing stores. The library owns the limiter and concurrency policy; the host supplies only atomic storage. `AtomicSlidingWindowStore` handles admission, while `ConcurrencySlotStore` holds named, renewable slots. They are different contracts because a request counted once and a stream held open for minutes have different lifetimes.

The optional key namespace isolates test runs that share a Redis instance. Production deployments normally omit it instead of weakening the real limits.

`MinimalRedisClient` is structural and names only the operations used by the library's Redis-backed store factories. A consumer can adapt another Redis client without importing the `redis` package's nominal client type into its public surface.

## Cross-instance messaging

`CrossInstanceMessaging` publishes messages and creates subscriptions that return an asynchronous unsubscribe function. A host with multiple replicas supplies a real implementation so subscription events and grant revocations reach the process holding the affected stream. When the seam is absent, the library operates as a single-instance server and must report that reduction at construction.

## Shared HTTP utilities

Protocol CORS headers and bounded request-body handling belong with the extracted OAuth and MCP serving layer. Host routes that also need those utilities should import the library implementation after the extraction lands; neither side keeps a second copy.

Trusted-proxy resolution follows the same ownership rule. The host supplies the raw socket peer and policy, and the library owns the security-sensitive resolution algorithm. Do not configure an adapter to replace the socket peer with a client-controlled forwarding header before the library sees it.
