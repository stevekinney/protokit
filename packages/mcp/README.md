# @lostgradient/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server engine: tool, resource, and prompt registries; a consumer-defined OAuth scope vocabulary; and the request-boundary pieces a host needs to serve MCP over HTTP.

The engine is deliberately unopinionated about identity and storage. `McpContext` is a plain pre-fetched object with no database handle and no ambient service locator, and `McpUserProfile` is `{ id, email, name, image, role }` — generic, not tied to any identity provider.

## Install

```sh
npm install @lostgradient/mcp
```

Requires Node 22 or later, or Bun. The package is ESM-only.

## Defining a server

Scopes come first, because every tool, resource, and prompt has to declare one. `defineScopes` returns definers bound to your vocabulary, so a mistyped scope is a compile error on the primitive itself rather than a runtime surprise later.

```ts
import { defineScopes, createMcpServer } from '@lostgradient/mcp';
import { z } from 'zod';

const scopes = defineScopes({
	'repositories:read': 'Read repository metadata.',
});

const listRepositories = scopes.defineTool({
	name: 'list_repositories',
	title: 'List repositories',
	description: 'Lists repositories the signed-in user can access.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	requiredScope: 'repositories:read',
	handler: async () => ({ content: [] }),
});

const registry = scopes.defineRegistry({
	tools: [listRepositories],
	resources: [],
	prompts: [],
	serverInfo: { name: 'my-server', version: '1.0.0' },
	// Supply your own. Without this, the server advertises instructions
	// describing a different server's tools and endpoints — see below.
	instructions: 'Lists repositories the signed-in user can access.',
});
```

## Constructing a server

`createMcpServer` takes a context describing the current request. There is no ambient state: everything it needs is passed in, which is what lets the engine be embedded without knowing how you authenticate or store anything.

```ts
const server = createMcpServer(
	{
		userId: user.id,
		user, // { id, email, name, image, role }
		scopes: grantedScopes, // the scopes this request's token actually carries
		enableUiExtension: false,
		// Supplied so construction never reads the ambient environment; see
		// "Construction and the ambient environment" below.
		enableConformanceMode: false,
		// Optional: `requestId` to trace one action through your logs, `era` to
		// pin the protocol revision, `publishResourceUpdate` to fan subscription
		// events out across replicas.
	},
	registry,
);
```

`scopes` is the request's granted scopes, not your vocabulary — the server compares each operation's `requiredScope` against it, so passing the full vocabulary here would authorize everything.

> **Always set `instructions` on your registry.** When it is absent, the server falls back to instructions bundled with this package, which describe a different server: its own demo tools, its own OAuth endpoints, and an assertion that every operation is read-only. A client would receive a confident, wrong description of what your server does.

### Construction and the ambient environment

Importing this package reads nothing from `process.env`. **Constructing a server can**, through two fallbacks, and both are worth supplying explicitly:

| Omitted                         | What happens                                              |
| ------------------------------- | --------------------------------------------------------- |
| `context.enableConformanceMode` | falls back to `MCP_CONFORMANCE_MODE` from the environment |
| `registry.serverInfo`           | falls back to `MCP_SERVER_NAME` from the environment      |

Each fallback calls the environment parser, which requires `NODE_ENV`. So in a plain Node process with `NODE_ENV` unset, omitting **either** makes `createMcpServer` throw before returning — supplying only one is not enough. The example above supplies both, which is why it runs anywhere.

If you would rather rely on the environment, set `NODE_ENV` (and any other variable the schema requires) before constructing, and validate it yourself with `parseMcpServerEnvironment` so the failure is yours to report rather than a throw from inside the factory.

`getSupportedScopes(registry)` returns the sorted union of every scope your registry actually requires. Use it for the `scopes_supported` field of your OAuth metadata documents and for the `scope` attribute on a `401` challenge, rather than maintaining that list by hand.

## Running protocol conformance

`runMcpConformance` runs either protocol era against your registry. Discovery is checked automatically. Supply valid arguments only for the tools or prompts you want invoked, and resource URIs only for the resources you want read—the harness cannot safely invent valid consumer input.

```ts
import { runMcpConformance } from '@lostgradient/mcp';

const results = await runMcpConformance({
	era: 'modern', // or 'legacy'
	registry,
	scopeVocabulary: scopes,
	identity: { userId: user.id, user },
	toolProbes: { list_repositories: {} },
});

for (const result of results) {
	console.log(result.name, result.status, result.error ?? '');
}
```

Each result has a stable behavior name and its own `passed` or `failed` status. One failed tool, resource, or prompt probe does not hide the results of the remaining behaviors. Supply the same application identity every probe should use; otherwise the harness creates one stable synthetic identity for the run. The runner disables package-owned conformance fixtures so discovery reflects only the supplied registry. `createConsumerConformanceHandler` exposes the lower-level request handler when a consumer needs to drive its own client or explicitly enable those fixtures, including watched-resource notifications. Its localhost DNS-rebinding check runs independently of `enableConformanceMode`.

## Environment

Importing this package reads nothing from `process.env` and cannot throw, whatever the ambient environment. That is deliberate: a library which validates its host's environment during module evaluation cannot be embedded, because the host can neither catch the failure nor supply a different environment nor decide whether it wants a server at all.

Parse explicitly instead:

```ts
import { parseMcpServerEnvironment, getEnvironment } from '@lostgradient/mcp';

const environment = parseMcpServerEnvironment(process.env);
```

`getEnvironment()` is the lazy, memoized equivalent for callers happy to read `process.env` on first use.

## Authorizing subscriptions

`areResourceSubscriptionsAuthorized(uris, scopes, registry)` is exported because `subscriptions/listen` is decided at the HTTP boundary, before a request reaches the server instance — so a host that mounts this engine must call it there. Omitting it means a client with any valid token can observe updates for a resource whose scope it was never granted.

## Rate limiting and concurrency

`@lostgradient/mcp/rate-limit` provides the protocol-level sliding-window policy, in-memory and Redis stores, MCP concurrency slots, and the standard `429` response. The Redis factories accept the `MinimalRedisClient` seam from `@lostgradient/mcp/oauth`; they do not require a particular Redis package or a full client object.

The shared `RateLimitConfiguration` owns exactly eight protocol categories: OAuth authorize, registration, token network, token client, and revocation; MCP network and user; and failed authentication. Host-only routes such as sign-in, session creation, health, and metrics should use `SlidingWindowRateLimiter` directly with host-owned categories rather than extending the protocol category union.

Concurrency is a resource-lifetime concern, not a handler-promise concern. For a streaming response, pass the acquired slot to `attachConcurrencySlotToResponseLifetime` so it renews while the body remains open and releases only when the body closes, is canceled, or errors. A host that separately tracks requests must follow the same rule; Tribunal's other implementation is `applications/web/src/lib/in-flight-request-tracker.ts`.

## Host logging

Call `setLogger(hostLogger)` before serving requests to route every engine log record through the host's existing sink and redaction policy. The logger is structural and deliberately small: `info`, `warn`, `error`, and `child`. A host does not need to import pino or implement any other pino API. The exported `logger` and `getLogger()` remain the package's full pino-backed logger for compatibility; injection changes the engine's internal sink. If `setLogger` is not called, engine records use that same lazy pino logger and existing behavior.

## Required server identity in 0.2.0

`MCP_SERVER_NAME` is required starting in 0.2.0. The package no longer defaults to the template-branded `template-mcp-server` identity because that fallback was silently advertised to every connected MCP client. Set the explicit server name before constructing a server.

## Mounting in SvelteKit

`@lostgradient/mcp/sveltekit` provides a dependency-free adapter for a SvelteKit `handle` chain. Call `createSvelteKitMcpMount` once in a long-lived server process, pass the OAuth seams and MCP runtime, and delegate each request to the returned `handle`. The adapter claims its process lifecycle synchronously: a second mount fails, disposal is permanent, and failed startup cannot be retried in the same process.

The host's identity handle must run first and call `primeSvelteKitMcpIdentity(event, identity)` for every request, including anonymous requests with `null`. The mount rejects a request when that handle was skipped or sequenced after it. It reads `event.getClientAddress()` for each request so the OAuth and MCP serving layers receive the immediate socket peer rather than a construction-time value.

The host still owns the network listener, signal handling, request draining, and process termination. It must dispose the mount only after response bodies, including long-lived MCP streams, have closed or been canceled. Request-scoped edge and serverless runtimes cannot preserve the mount's subscriptions and must not set `longLivedProcess` to true. Adapter-node deployment behavior is intentionally left to the first host integration rather than claimed by this package contract.

## Client ID Metadata Documents

`@lostgradient/mcp/oauth` exports Client ID Metadata Document fetching and the shared OAuth security utilities. Use `safeFetchPublicHttpsUrl` for any client-supplied metadata URL. It applies the complete SSRF boundary as one operation: the URL must use HTTPS, literal private addresses are rejected, every DNS result must be public, and redirects are disabled. Do not recreate those checks at a host call site.

The dedicated `@lostgradient/mcp/oauth/client-metadata-documents` subpath exposes the same safe fetch together with `fetchClientIdMetadataDocument` and `isClientIdMetadataDocumentUrl`. The general `/oauth` entry point also owns `isAddressInCidr`, `isValidCidr`, `isValidRedirectUri`, `isValidClientName`, `isExactContentType`, `withDeadline`, and IP canonicalization so an embedding host does not maintain a second security implementation.

## Subpaths

| Subpath                                             | Contents                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `@lostgradient/mcp`                                 | The engine: server factory, registries, scope vocabularies, primitives |
| `@lostgradient/mcp/logger`                          | Host logger injection and the lazy default pino logger                 |
| `@lostgradient/mcp/env`                             | `parseMcpServerEnvironment` and `getEnvironment`                       |
| `@lostgradient/mcp/environment-schema`              | The raw Zod shape, side-effect free                                    |
| `@lostgradient/mcp/metrics`                         | The in-process metrics collector                                       |
| `@lostgradient/mcp/oauth`                           | OAuth contracts, metadata fetching, and shared security utilities      |
| `@lostgradient/mcp/oauth/stores`                    | Type-only contracts for durable OAuth storage                          |
| `@lostgradient/mcp/oauth/testing`                   | In-memory OAuth stores for tests                                       |
| `@lostgradient/mcp/oauth/postgres`                  | PostgreSQL OAuth store implementations                                 |
| `@lostgradient/mcp/oauth/client-metadata-documents` | Client ID Metadata Document validation and SSRF-safe fetching          |
| `@lostgradient/mcp/rate-limit`                      | Sliding-window policy, stores, concurrency slots, and `429` responses  |
| `@lostgradient/mcp/http`                            | Ordered MCP HTTP serving and per-user handler lifecycle                |
| `@lostgradient/mcp/sveltekit`                       | Host-agnostic SvelteKit handle-chain mount                             |
| `@lostgradient/mcp/version`                         | The advertised package version                                         |

## License

MIT
