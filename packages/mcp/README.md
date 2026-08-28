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

## Subpaths

| Subpath                                | Contents                                                               |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `@lostgradient/mcp`                    | The engine: server factory, registries, scope vocabularies, primitives |
| `@lostgradient/mcp/logger`             | The shared pino logger, built lazily on first use                      |
| `@lostgradient/mcp/env`                | `parseMcpServerEnvironment` and `getEnvironment`                       |
| `@lostgradient/mcp/environment-schema` | The raw Zod shape, side-effect free                                    |
| `@lostgradient/mcp/metrics`            | The in-process metrics collector                                       |
| `@lostgradient/mcp/version`            | The advertised package version                                         |

## License

MIT
