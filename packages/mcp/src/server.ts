import { McpServer } from '@modelcontextprotocol/server';
import type { ServerCapabilities } from '@modelcontextprotocol/server';
import { allTools, conformanceOnlyTools } from './tools/index.js';
import { allResources } from './resources/index.js';
import { allPrompts } from './prompts/index.js';
// CONTENT-001: Bun's default loader for `.md` files renders them to HTML
// (`<p>`, `<h2>`, `<ul>`/`<li>`, etc.) — confirmed empirically, not
// documented behavior this codebase previously relied on correctly. MCP
// `instructions` is read by an LLM client as natural-language text, not
// HTML; shipping literal markup tags would waste characters inside the
// roadmap's 512-character "meaningful without later context" budget and
// actively confuse a client parsing it as prose. Forcing the `text` loader
// via the import attribute below ships the actual Markdown source
// (headings as `## `, lists as `- `, etc.), which is legible prose either
// way and never contains raw HTML tags.
import instructions from './instructions.md' with { type: 'text' };
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { registerConformanceFixtures } from './conformance-fixture-registration.js';
import { environment } from './env.js';
import { metricsCollector } from './metrics.js';
import type { ResourceSubscriptionBackend } from './resource-subscription-backend.js';
import type { McpToolDefinition, McpUserProfile } from './types/primitives.js';

// META-001 / S-20: a capability advertised here is a promise a connector is
// entitled to rely on. `sampling` and `elicitation` are not even real server
// capabilities (the wire schema has no such keys — they describe what a
// *client* offers a server, not the reverse; the server-to-client fixtures
// that use them work through `ctx.mcpReq.send`, which does not depend on the
// server's own `capabilities` object at all), `logging` has no
// `logging/setLevel` handler and no production caller of
// `notifications/message` outside the conformance fixtures, and neither
// `tools`, `resources`, nor `prompts` ever sends a `list_changed`
// notification, so `listChanged` is set to `false` explicitly rather than
// omitted — the SDK's `registerTool`/`registerResource`/`registerPrompt`
// each default an *unset* `listChanged` bit back to `true` the first time a
// primitive of that kind is registered, so leaving it out here would
// silently re-advertise the same lie this item removes.
function buildServerCapabilities(input: {
	enableConformanceMode: boolean;
	experimentalCapabilities: Record<string, { version: string }>;
}): ServerCapabilities {
	return {
		tools: { listChanged: false },
		resources: { listChanged: false },
		prompts: { listChanged: false },
		experimental: input.experimentalCapabilities,
		// Conformance fixtures (registered only in conformance mode, never in
		// production) send `notifications/message` — the SDK throws
		// `CapabilityNotSupported` if a server does that without advertising
		// `logging`, so the conformance-only fixture path needs the real
		// capability, scoped to exactly the mode that uses it.
		...(input.enableConformanceMode ? { logging: {} } : {}),
	};
}

export function createMcpServer(context: {
	userId: string;
	user: McpUserProfile;
	enableUiExtension: boolean;
	enableConformanceMode?: boolean;
	subscriptionBackend?: ResourceSubscriptionBackend;
}): McpServer {
	const enableConformanceMode = context.enableConformanceMode ?? environment.MCP_CONFORMANCE_MODE;
	const experimentalCapabilities: Record<string, { version: string }> = {};
	// CONTENT-001: advertising the MCP Apps extension is not just gated on the
	// `MCP_ENABLE_UI_EXTENSION` flag (which defaults off, but an operator can
	// still set it) — it also requires at least one registered resource that
	// is actually an MCP App (`RESOURCE_MIME_TYPE`). `packages/mcp-apps` ships
	// no application today, so this mechanically keeps the capability absent
	// even if the flag is turned on by mistake, rather than only relying on
	// the default. Once a real app + resource exists, this becomes true on
	// its own with no further change needed here.
	const hasRegisteredUiExtensionResource = allResources.some(
		(resource) => resource.mimeType === RESOURCE_MIME_TYPE,
	);
	if (context.enableUiExtension && hasRegisteredUiExtensionResource) {
		experimentalCapabilities[EXTENSION_ID] = { version: '1.0.0' };
	}

	const serverName = environment.MCP_SERVER_NAME ?? 'template-mcp-server';

	const server = new McpServer(
		{
			name: serverName,
			version: '0.1.0',
		},
		{
			instructions,
			capabilities: buildServerCapabilities({ enableConformanceMode, experimentalCapabilities }),
		},
	);

	function registerToolDefinition(tool: McpToolDefinition): void {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
				...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
				annotations: tool.annotations,
				...(tool._meta ? { _meta: tool._meta } : {}),
			},
			async (input) => {
				const start = Date.now();
				const result = await tool.handler(input as never, context);
				metricsCollector.recordToolInvocation(
					tool.name,
					Date.now() - start,
					'isError' in result && result.isError === true,
				);
				return result;
			},
		);
	}

	for (const tool of allTools) {
		registerToolDefinition(tool);
	}

	for (const resource of allResources) {
		server.registerResource(
			resource.name,
			resource.uri,
			{ title: resource.title, description: resource.description, mimeType: resource.mimeType },
			async (uri) => resource.handler(uri, context),
		);
	}

	for (const prompt of allPrompts) {
		server.registerPrompt(
			prompt.name,
			{
				title: prompt.title,
				description: prompt.description,
				...(prompt.arguments ? { argsSchema: prompt.arguments } : {}),
			},
			async (arguments_) => prompt.handler(arguments_ as never, context),
		);
	}

	// META-001 / PROTO-001 notes: `resources.subscribe` is deliberately NOT
	// advertised above — subscribing records interest in the backend but
	// nothing ever delivers a `notifications/resources/updated` push to the
	// caller (PROTO-001 removed the in-process transport registry that used
	// to do that; building the `2026-07-28` replacement, e.g.
	// `subscriptions/listen`, is PROTO-002's job). The handlers are left
	// registered rather than removed because a spec-compliant client only
	// calls `resources/subscribe` when the capability is advertised (the SDK
	// itself does not gate this method on any capability check), so this is
	// dead-but-harmless surface area today and the exact seam PROTO-002 will
	// build real delivery onto — removing it now would just be undone there.
	if (context.subscriptionBackend) {
		const backend = context.subscriptionBackend;
		server.server.setRequestHandler('resources/subscribe', async (request, ctx) => {
			const sessionIdentifier = ctx.sessionId ?? 'stateless';
			await backend.subscribe(sessionIdentifier, request.params.uri);
			return {};
		});
		server.server.setRequestHandler('resources/unsubscribe', async (request, ctx) => {
			const sessionIdentifier = ctx.sessionId ?? 'stateless';
			await backend.unsubscribe(sessionIdentifier, request.params.uri);
			return {};
		});
	}

	if (enableConformanceMode) {
		// CONTENT-001: synthetic/protocol-only fixtures (e.g. `list_audit_events`,
		// which returns generated data and exists to exercise cursor pagination)
		// are registered here rather than in `allTools`, so a production
		// deployment — which never sets `enableConformanceMode` — never
		// advertises or serves them.
		for (const tool of conformanceOnlyTools) {
			registerToolDefinition(tool);
		}
		registerConformanceFixtures(server, context.subscriptionBackend);
	}

	return server;
}
