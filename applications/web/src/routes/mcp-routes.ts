import { and, eq, gt, isNull } from 'drizzle-orm';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { database, schema } from '@template/database';
import {
	getSupportedScopes,
	isLoopbackHostname,
	hasValidLocalhostRebindingHeaders,
} from '@template/mcp';
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
import { mcpMaxBearerTokenLength } from '@web/lib/request-limits';

/**
 * AUTHZ-001: every `WWW-Authenticate` challenge this endpoint returns
 * carries the same RFC 6750 §3 `scope` attribute — the space-delimited set
 * of scopes this server supports — so a caller (or a human debugging one)
 * always knows what to ask for, regardless of which specific failure
 * produced the `401`. Built once, here, rather than at each of this file's
 * four challenge call sites, so they cannot drift out of sync with each
 * other or with the identical list the OAuth metadata endpoints publish
 * (`getSupportedScopes()`, shared with `oauth-routes.tsx`).
 */
function bearerChallenge(resourceMetadataUrl: string, errorCode?: string): string {
	const parts = [
		...(errorCode ? [`error="${errorCode}"`] : []),
		`resource_metadata="${resourceMetadataUrl}"`,
		`scope="${getSupportedScopes().join(' ')}"`,
	];
	return `Bearer ${parts.join(', ')}`;
}

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
				'WWW-Authenticate': bearerChallenge(resourceMetadataUrl),
			},
		});
	}

	const accessToken = authorizationHeader.slice(7);
	if (accessToken.length === 0 || accessToken.length > mcpMaxBearerTokenLength) {
		const baseUrl = getBaseUrl(context.request);
		const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource/mcp`;
		return createMcpProtocolErrorResponse({
			status: 401,
			error: 'unauthorized',
			errorDescription: 'Malformed bearer token.',
			headers: {
				...mcpCorsHeaders,
				'MCP-Protocol-Version': mcpLatestProtocolVersion,
				'WWW-Authenticate': bearerChallenge(resourceMetadataUrl, 'invalid_token'),
			},
		});
	}

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
				'WWW-Authenticate': bearerChallenge(resourceMetadataUrl, 'invalid_token'),
			},
		});
	}

	// OAUTH-001 / RFC 8707: a token that is otherwise valid (unrevoked,
	// unexpired, correctly hashed) is still rejected outright if it was not
	// issued for exactly this resource. Without this check, any token ever
	// minted by this authorization server — regardless of which client or
	// which resource it was requested for — would be accepted here, since
	// nothing above verifies the token's audience. Treated the same as an
	// invalid token (RFC 6750 `invalid_token`), not leaked as a distinct
	// error that would let a caller distinguish "wrong audience" from
	// "doesn't exist" and probe for issued tokens.
	if (oauthToken.resource !== getMcpResourceUrl(context.request)) {
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
				'WWW-Authenticate': bearerChallenge(resourceMetadataUrl, 'invalid_token'),
			},
		});
	}

	return buildMcpAuthInfo({
		accessToken,
		expiresAt: oauthToken.expiresAt,
		extra: {
			userId: oauthToken.userId,
			oauthClientId: oauthToken.clientId,
			scopes: (oauthToken.scope ?? '').split(' ').filter((scope) => scope.length > 0),
			resource: oauthToken.resource,
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
