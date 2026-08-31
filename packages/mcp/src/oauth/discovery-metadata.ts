import { EXTENSION_ID } from '@modelcontextprotocol/ext-apps/server';
import type { McpRegistry } from '../scope-vocabulary.js';
import { getSupportedScopes } from '../supported-scopes.js';
import { hasRegisteredUiExtensionResource } from '../ui-extension-support.js';
import type { OAuthConfiguration, OAuthRequestContext } from './index.js';

export type OAuthDiscoveryConfiguration = Pick<
	OAuthConfiguration,
	'issuer' | 'baseUrl' | 'mcpUiExtension'
> & {
	serverName: string;
	mcpProtocolVersion: string;
};

const oauthCorsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers':
		'Content-Type, Authorization, mcp-session-id, mcp-protocol-version, Last-Event-ID',
	'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
};

function jsonMetadata(body: unknown): Response {
	return Response.json(body, { headers: oauthCorsHeaders });
}

function metadataValues(configuration: OAuthDiscoveryConfiguration, registry: McpRegistry) {
	const issuer = configuration.issuer.href.replace(/\/$/, '');
	const baseUrl = configuration.baseUrl.href.replace(/\/$/, '');
	const scopesSupported = getSupportedScopes(registry);
	return { issuer, baseUrl, scopesSupported };
}

export function handleOauthAuthorizationMetadataGet(
	_context: OAuthRequestContext,
	configuration: OAuthDiscoveryConfiguration,
	registry: McpRegistry,
): Response {
	const { issuer, baseUrl, scopesSupported } = metadataValues(configuration, registry);
	return jsonMetadata({
		issuer,
		authorization_endpoint: `${baseUrl}/oauth/authorize`,
		token_endpoint: `${baseUrl}/oauth/token`,
		registration_endpoint: `${baseUrl}/oauth/register`,
		revocation_endpoint: `${baseUrl}/oauth/revoke`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
		scopes_supported: scopesSupported,
		client_id_metadata_document_supported: true,
		authorization_response_iss_parameter_supported: true,
		service_documentation: `${baseUrl}/support`,
		op_policy_uri: `${baseUrl}/privacy`,
		op_tos_uri: `${baseUrl}/terms`,
		extensions: {
			...(configuration.mcpUiExtension.enabled && hasRegisteredUiExtensionResource(registry)
				? { [EXTENSION_ID]: {} }
				: {}),
		},
	});
}

export function handleOauthProtectedResourceMetadataGet(
	_context: OAuthRequestContext,
	configuration: OAuthDiscoveryConfiguration,
	registry: McpRegistry,
): Response {
	const { issuer, baseUrl, scopesSupported } = metadataValues(configuration, registry);
	return jsonMetadata({
		resource: `${baseUrl}/mcp`,
		authorization_servers: [issuer],
		scopes_supported: scopesSupported,
		resource_name: configuration.serverName,
		resource_documentation: `${baseUrl}/support`,
		resource_policy_uri: `${baseUrl}/privacy`,
		resource_tos_uri: `${baseUrl}/terms`,
	});
}

export function handleOauthProtectedResourceMcpMetadataGet(
	_context: OAuthRequestContext,
	configuration: OAuthDiscoveryConfiguration,
	registry: McpRegistry,
): Response {
	const { issuer, baseUrl, scopesSupported } = metadataValues(configuration, registry);
	return jsonMetadata({
		resource: `${baseUrl}/mcp`,
		authorization_servers: [issuer],
		bearer_methods_supported: ['header'],
		mcp_protocol_version: configuration.mcpProtocolVersion,
		scopes_supported: scopesSupported,
		resource_name: configuration.serverName,
		resource_documentation: `${baseUrl}/support`,
		resource_policy_uri: `${baseUrl}/privacy`,
		resource_tos_uri: `${baseUrl}/terms`,
	});
}
