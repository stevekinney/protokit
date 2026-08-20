import { environment } from '@web/env';

export const mcpProtocolVersion = environment.MCP_PROTOCOL_VERSION ?? '2025-11-25';
export const mcpUiExtensionIdentifier = 'io.modelcontextprotocol/ui';
export const mcpEnterpriseAuthorizationExtensionIdentifier =
	'io.modelcontextprotocol/enterprise-managed-authorization';
