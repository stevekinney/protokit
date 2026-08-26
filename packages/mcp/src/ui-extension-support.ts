import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { allResources } from './resources/index.js';

/**
 * CONTENT-001 / review finding: advertising the MCP Apps UI extension is
 * not just gated on the `MCP_ENABLE_UI_EXTENSION` flag (which defaults off,
 * but an operator -- or this repository's own setup wizard -- can still
 * turn it on) -- it also requires at least one registered resource that is
 * actually an MCP App (`RESOURCE_MIME_TYPE`). `packages/mcp-apps` ships no
 * application today, so this predicate is always `false` in this
 * repository, mechanically keeping the capability advertised as absent
 * even if the flag is turned on by mistake.
 *
 * This is the single source of truth for that predicate. `server.ts`'s
 * real `/mcp` capabilities and `oauth-routes.ts`'s authorization-server
 * metadata `extensions` field both call this function rather than each
 * re-deriving their own copy of it, so a client can never discover UI
 * extension support in OAuth metadata and then receive server capabilities
 * without it (or vice versa) -- the two advertisements are mechanically
 * kept in agreement, not just conventionally.
 */
export function hasRegisteredUiExtensionResource(): boolean {
	return allResources.some((resource) => resource.mimeType === RESOURCE_MIME_TYPE);
}
