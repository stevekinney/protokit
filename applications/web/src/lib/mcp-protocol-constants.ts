/**
 * The MCP protocol revisions this server negotiates, oldest first. Protocol
 * negotiation itself is owned by the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`) —
 * these constants exist only for places outside the SDK boundary (OAuth
 * metadata documents, health reporting) that need to describe what the
 * server understands without duplicating negotiation logic.
 *
 * The legacy `2025-11-25` lane stays only while Claude's hosted connector
 * documentation lists it as newest supported; remove it and this constant's
 * first entry in one direct change once that changes (see the roadmap's
 * compatibility contract).
 */
export const mcpSupportedProtocolVersions = ['2025-11-25', '2026-07-28'] as const;
export const mcpLatestProtocolVersion =
	mcpSupportedProtocolVersions[mcpSupportedProtocolVersions.length - 1];
export const mcpUiExtensionIdentifier = 'io.modelcontextprotocol/ui';
