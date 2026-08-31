import { getEnvironment as getMcpEnvironment, templateRegistry } from '@lostgradient/mcp';
import {
	handleOauthAuthorizationMetadataGet as handleLibraryOauthAuthorizationMetadataGet,
	handleOauthAuthorizeApprove as handleLibraryOauthAuthorizeApprove,
	handleOauthAuthorizeDeny as handleLibraryOauthAuthorizeDeny,
	handleOauthAuthorizeGet as handleLibraryOauthAuthorizeGet,
	handleOauthProtectedResourceMetadataGet as handleLibraryOauthProtectedResourceMetadataGet,
	handleOauthProtectedResourceMcpMetadataGet as handleLibraryOauthProtectedResourceMcpMetadataGet,
	handleOauthRegisterPost as handleLibraryOauthRegisterPost,
	handleOauthRevokePost as handleLibraryOauthRevokePost,
	handleOauthTokenPost as handleLibraryOauthTokenPost,
	type OAuthDiscoveryConfiguration,
	type OAuthRequestContext,
} from '@lostgradient/mcp/oauth';
import { environment } from '@web/env';
import { getBaseUrl } from '@web/lib/base-url';
import { getMcpResourceUrl } from '@web/lib/mcp-request-context';
import { mcpLatestProtocolVersion } from '@web/lib/mcp-protocol-constants';
import { createOauthAuthorizeHostSeams } from '@web/lib/oauth-authorize-seams';
import {
	createOauthStatelessHostSeams,
	toOauthRequestContext,
} from '@web/lib/oauth-stateless-seams';
import type { RequestContext } from '@web/lib/request-context';

export async function handleOauthAuthorizeGet(context: RequestContext): Promise<Response> {
	return handleLibraryOauthAuthorizeGet(
		toOauthRequestContext(context),
		createOauthAuthorizeHostSeams(context),
	);
}

export async function handleOauthAuthorizeApprove(context: RequestContext): Promise<Response> {
	return handleLibraryOauthAuthorizeApprove(
		toOauthRequestContext(context),
		createOauthAuthorizeHostSeams(context),
	);
}

export async function handleOauthAuthorizeDeny(context: RequestContext): Promise<Response> {
	return handleLibraryOauthAuthorizeDeny(
		toOauthRequestContext(context),
		createOauthAuthorizeHostSeams(context),
	);
}

export async function handleOauthRegisterPost(context: RequestContext): Promise<Response> {
	return handleLibraryOauthRegisterPost(
		toOauthRequestContext(context),
		createOauthStatelessHostSeams(context.request),
	);
}

export async function handleOauthRevokePost(context: RequestContext): Promise<Response> {
	return handleLibraryOauthRevokePost(
		toOauthRequestContext(context),
		createOauthStatelessHostSeams(context.request),
	);
}

export async function handleOauthTokenPost(context: RequestContext): Promise<Response> {
	return handleLibraryOauthTokenPost(
		toOauthRequestContext(context),
		createOauthStatelessHostSeams(context.request),
	);
}

export async function handleOauthAuthorizationMetadataGet(
	context: RequestContext,
): Promise<Response> {
	return handleLibraryOauthAuthorizationMetadataGet(
		toOauthDiscoveryContext(context),
		getOauthDiscoveryConfiguration(context.request),
		templateRegistry,
	);
}

export async function handleOauthProtectedResourceMetadataGet(
	context: RequestContext,
): Promise<Response> {
	return handleLibraryOauthProtectedResourceMetadataGet(
		toOauthDiscoveryContext(context),
		getOauthDiscoveryConfiguration(context.request),
		templateRegistry,
	);
}

export async function handleOauthProtectedResourceMcpMetadataGet(
	context: RequestContext,
): Promise<Response> {
	return handleLibraryOauthProtectedResourceMcpMetadataGet(
		toOauthDiscoveryContext(context),
		getOauthDiscoveryConfiguration(context.request),
		templateRegistry,
	);
}

function toOauthDiscoveryContext(context: RequestContext): OAuthRequestContext {
	return {
		request: context.request,
		requestUrl: context.requestUrl,
		requestId: context.requestId,
		socketAddress: context.clientAddress,
		identity: null,
	};
}

function getOauthDiscoveryConfiguration(request: Request): OAuthDiscoveryConfiguration {
	const publicUrl = new URL(getBaseUrl(request));
	return {
		issuer: getBaseUrl(request),
		baseUrl: publicUrl,
		resource: new URL(getMcpResourceUrl(request)),
		serverName: getMcpEnvironment().MCP_SERVER_NAME,
		mcpProtocolVersion: mcpLatestProtocolVersion,
		mcpUiExtension: { enabled: environment.mcpEnableUiExtension },
		serviceDocumentation: new URL('/support', publicUrl),
		privacyPolicy: new URL('/privacy', publicUrl),
		termsOfService: new URL('/terms', publicUrl),
	};
}
