import { and, eq, gt, isNull } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { isLoopbackHostname, hasValidLocalhostRebindingHeaders } from '@template/mcp';
import { environment } from '@web/env';
import { getBaseUrl } from '@web/lib/base-url';
import { hashCredential } from '@web/lib/hash-credential';
import { handleMcpRequest } from '@web/lib/mcp-handler';
import { createMcpCorsHeaders, validateMcpRequestOrigin } from '@web/lib/mcp-origin-validation';
import { mcpProtocolVersion } from '@web/lib/mcp-protocol-constants';
import { createMcpProtocolErrorResponse } from '@web/lib/mcp-protocol-error-response';
import type { RequestContext } from '@web/lib/request-context';
import { evaluateEnterpriseAuthorizationPolicy } from '@web/lib/enterprise-authorization-policy';

async function authenticateMcpUser(
	context: RequestContext,
): Promise<Response | { userId: string }> {
	const mcpCorsHeaders = createMcpCorsHeaders(context.request);

	if (
		environment.MCP_CONFORMANCE_MODE &&
		isLoopbackHostname(context.requestUrl.hostname) &&
		!hasValidLocalhostRebindingHeaders(context.request.headers)
	) {
		return createMcpProtocolErrorResponse({
			status: 403,
			error: 'forbidden',
			errorDescription: 'Request rejected by localhost DNS rebinding protection.',
			headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpProtocolVersion },
		});
	}

	if (context.request.method === 'OPTIONS') {
		const originValidation = validateMcpRequestOrigin(context.request);
		if (!originValidation.allowed) {
			return createMcpProtocolErrorResponse({
				status: 403,
				error: 'forbidden',
				errorDescription: 'Origin is not allowed for MCP requests.',
				headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpProtocolVersion },
			});
		}

		return new Response(null, {
			status: 204,
			headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpProtocolVersion },
		});
	}

	const authorizationHeader = context.request.headers.get('authorization');
	if (!authorizationHeader?.startsWith('Bearer ')) {
		const baseUrl = getBaseUrl(context.request);
		const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource/mcp`;
		return createMcpProtocolErrorResponse({
			status: 401,
			error: 'unauthorized',
			errorDescription: 'Missing or invalid Authorization header.',
			headers: {
				...mcpCorsHeaders,
				'MCP-Protocol-Version': mcpProtocolVersion,
				'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
			},
		});
	}

	const accessToken = authorizationHeader.slice(7);
	const accessTokenHash = hashCredential(accessToken);
	const [oauthToken] = await database
		.select()
		.from(schema.oauthTokens)
		.where(
			and(
				eq(schema.oauthTokens.accessToken, accessTokenHash),
				isNull(schema.oauthTokens.revokedAt),
				gt(schema.oauthTokens.expiresAt, new Date()),
			),
		)
		.limit(1);
	if (!oauthToken) {
		const baseUrl = getBaseUrl(context.request);
		const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource/mcp`;
		return createMcpProtocolErrorResponse({
			status: 401,
			error: 'unauthorized',
			errorDescription: 'Invalid or expired token.',
			headers: {
				...mcpCorsHeaders,
				'MCP-Protocol-Version': mcpProtocolVersion,
				'WWW-Authenticate': `Bearer error="invalid_token", resource_metadata="${resourceMetadataUrl}"`,
			},
		});
	}

	const enterpriseDecision = await evaluateEnterpriseAuthorizationPolicy({
		clientId: oauthToken.clientId,
		userId: oauthToken.userId,
		action: 'access_mcp',
	});
	if (!enterpriseDecision.allowed) {
		return createMcpProtocolErrorResponse({
			status: 403,
			error: 'forbidden',
			errorDescription: `Enterprise authorization policy denied access: ${enterpriseDecision.reason}`,
			headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpProtocolVersion },
		});
	}

	return { userId: oauthToken.userId };
}

export async function handleMcpRequestWithAuthentication(
	context: RequestContext,
): Promise<Response> {
	const authenticationResult = await authenticateMcpUser(context);
	if (authenticationResult instanceof Response) {
		return authenticationResult;
	}

	const response = await handleMcpRequest(context.request, authenticationResult.userId);
	const mcpCorsHeaders = createMcpCorsHeaders(context.request);
	for (const [headerName, headerValue] of Object.entries(mcpCorsHeaders)) {
		response.headers.set(headerName, headerValue);
	}
	response.headers.set('MCP-Protocol-Version', mcpProtocolVersion);
	return response;
}
