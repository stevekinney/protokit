import { and, eq, gt, isNull } from 'drizzle-orm';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { database, schema } from '@template/database';
import { isLoopbackHostname, hasValidLocalhostRebindingHeaders } from '@template/mcp';
import { environment } from '@web/env';
import { getBaseUrl } from '@web/lib/base-url';
import { hashCredential } from '@web/lib/hash-credential';
import { handleMcpRequest } from '@web/lib/mcp-handler';
import { createMcpCorsHeaders, validateMcpRequestOrigin } from '@web/lib/mcp-origin-validation';
import { mcpLatestProtocolVersion } from '@web/lib/mcp-protocol-constants';
import { createMcpProtocolErrorResponse } from '@web/lib/mcp-protocol-error-response';
import {
	buildMcpAuthInfo,
	getMcpResourceUrl,
	readMcpRequestAuthExtra,
} from '@web/lib/mcp-request-context';
import { acquireMcpConcurrencySlot } from '@web/lib/mcp-concurrency-limiter';
import { createRateLimitedResponse } from '@web/lib/rate-limit-response';
import {
	enforceMcpNetworkRateLimit,
	enforceMcpRateLimit,
	isAuthenticationLockedOut,
	recordFailedAuthentication,
} from '@web/lib/request-rate-limiter';
import type { RequestContext } from '@web/lib/request-context';
import { evaluateEnterpriseAuthorizationPolicy } from '@web/lib/enterprise-authorization-policy';

async function authenticateMcpUser(context: RequestContext): Promise<Response | AuthInfo> {
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
			headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpLatestProtocolVersion },
		});
	}

	const originValidation = validateMcpRequestOrigin(context.request);
	if (!originValidation.allowed) {
		return createMcpProtocolErrorResponse({
			status: 403,
			error: 'forbidden',
			errorDescription: 'Origin is not allowed for MCP requests.',
			headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpLatestProtocolVersion },
		});
	}

	if (context.request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpLatestProtocolVersion },
		});
	}

	if (await isAuthenticationLockedOut({ networkIdentity: context.networkIdentity })) {
		return createMcpProtocolErrorResponse({
			status: 429,
			error: 'rate_limited',
			errorDescription: 'Too many failed authentication attempts. Try again later.',
			headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpLatestProtocolVersion },
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
				'MCP-Protocol-Version': mcpLatestProtocolVersion,
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
		await recordFailedAuthentication({ networkIdentity: context.networkIdentity });
		const baseUrl = getBaseUrl(context.request);
		const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource/mcp`;
		return createMcpProtocolErrorResponse({
			status: 401,
			error: 'unauthorized',
			errorDescription: 'Invalid or expired token.',
			headers: {
				...mcpCorsHeaders,
				'MCP-Protocol-Version': mcpLatestProtocolVersion,
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
			headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpLatestProtocolVersion },
		});
	}

	return buildMcpAuthInfo({
		accessToken,
		expiresAt: oauthToken.expiresAt,
		extra: {
			userId: oauthToken.userId,
			oauthClientId: oauthToken.clientId,
			scopes: (oauthToken.scope ?? '').split(' ').filter((scope) => scope.length > 0),
			resource: getMcpResourceUrl(context.request),
			networkIdentity: context.networkIdentity,
		},
	});
}

export async function handleMcpRequestWithAuthentication(
	context: RequestContext,
): Promise<Response> {
	const mcpCorsHeaders = createMcpCorsHeaders(context.request);

	if (context.request.method !== 'OPTIONS') {
		const networkRateLimitResult = await enforceMcpNetworkRateLimit({
			networkIdentity: context.networkIdentity,
		});
		if (!networkRateLimitResult.allowed) {
			return createRateLimitedResponse(networkRateLimitResult.retryAfterSeconds, {
				...mcpCorsHeaders,
				'MCP-Protocol-Version': mcpLatestProtocolVersion,
			});
		}
	}

	const authenticationResult = await authenticateMcpUser(context);
	if (authenticationResult instanceof Response) {
		return authenticationResult;
	}

	const requestAuthExtra = readMcpRequestAuthExtra(authenticationResult);
	if (!requestAuthExtra) {
		return createMcpProtocolErrorResponse({
			status: 401,
			error: 'unauthorized',
			errorDescription: 'Invalid or expired token.',
			headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpLatestProtocolVersion },
		});
	}
	const rateLimitResult = await enforceMcpRateLimit({ userId: requestAuthExtra.userId });
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds, {
			...mcpCorsHeaders,
			'MCP-Protocol-Version': mcpLatestProtocolVersion,
		});
	}

	const concurrencySlot = await acquireMcpConcurrencySlot({ userId: requestAuthExtra.userId });
	if (!concurrencySlot.allowed) {
		return createMcpProtocolErrorResponse({
			status: 429,
			error: 'rate_limited',
			errorDescription: 'Too many concurrent MCP requests for this user.',
			headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpLatestProtocolVersion },
		});
	}

	try {
		const response = await handleMcpRequest(context.request, authenticationResult);
		for (const [headerName, headerValue] of Object.entries(mcpCorsHeaders)) {
			response.headers.set(headerName, headerValue);
		}
		return response;
	} finally {
		await concurrencySlot.release();
	}
}
