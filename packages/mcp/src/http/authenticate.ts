import type { AuthInfo } from '@modelcontextprotocol/server';

import {
	hasValidLocalhostRebindingHeaders,
	isLoopbackHostname,
} from '../localhost-request-validation.js';
import type {
	OAuthRequestContext,
	ResolveUserProfile,
	TrustedProxyConfiguration,
} from '../oauth/index.js';
import type { TokenStore } from '../oauth/stores.js';
import type { RequestRateLimiter } from '../rate-limit/index.js';
import { parseAuthorizationHeader } from './authorization-header.js';
import { buildMcpAuthInfo } from './request-context.js';
import {
	createMcpCorsHeaders,
	createMcpProtocolErrorResponse,
	isMcpOriginAllowed,
} from './responses.js';

export type McpAuthenticationOutcome = 'success' | 'expired_or_invalid_token' | 'invalid_resource';

export type McpAuthenticationConfiguration = {
	resource: URL;
	protocolVersion: string;
	supportedScopes: readonly string[];
	allowedOrigins: ReadonlySet<string>;
	maximumBearerTokenLength: number;
	maximumFailedAuthenticationAttempts: number;
	dnsRebindingProtection: boolean;
	trustedProxy: TrustedProxyConfiguration;
};

export type McpAuthenticationSeams = {
	tokens: TokenStore;
	resolveUserProfile: ResolveUserProfile;
	hashCredential(value: string): string;
	rateLimiter: Pick<RequestRateLimiter, 'consume' | 'peek'>;
	recordEvent(outcome: McpAuthenticationOutcome, requestId?: string): void;
};

function bearerChallenge(
	configuration: McpAuthenticationConfiguration,
	errorCode?: string,
): string {
	const resourceMetadataUrl = new URL(
		'/.well-known/oauth-protected-resource/mcp',
		configuration.resource,
	).href;
	const parts = [
		...(errorCode ? [`error="${errorCode}"`] : []),
		`resource_metadata="${resourceMetadataUrl}"`,
		`scope="${configuration.supportedScopes.join(' ')}"`,
	];
	return `Bearer ${parts.join(', ')}`;
}

function invalidTokenResponse(
	configuration: McpAuthenticationConfiguration,
	corsHeaders: Record<string, string>,
): Response {
	return createMcpProtocolErrorResponse({
		status: 401,
		error: 'unauthorized',
		errorDescription: 'Invalid or expired token.',
		headers: {
			...corsHeaders,
			'MCP-Protocol-Version': configuration.protocolVersion,
			'WWW-Authenticate': bearerChallenge(configuration, 'invalid_token'),
		},
	});
}

/**
 * Authenticates in this fixed order: rebinding, origin, preflight, lockout,
 * bearer scheme, bearer bounds and lookup, then resource audience.
 */
export async function authenticateMcpUser(input: {
	context: OAuthRequestContext;
	configuration: McpAuthenticationConfiguration;
	seams: McpAuthenticationSeams;
}): Promise<Response | AuthInfo> {
	const { context, configuration, seams } = input;
	const corsHeaders = createMcpCorsHeaders(context.request, configuration.allowedOrigins);
	const protocolHeaders = {
		...corsHeaders,
		'MCP-Protocol-Version': configuration.protocolVersion,
	};
	if (
		configuration.dnsRebindingProtection &&
		isLoopbackHostname(context.requestUrl.hostname) &&
		!hasValidLocalhostRebindingHeaders(context.request.headers)
	) {
		return createMcpProtocolErrorResponse({
			status: 403,
			error: 'forbidden',
			errorDescription: 'Request rejected by localhost DNS rebinding protection.',
			headers: protocolHeaders,
		});
	}
	if (!isMcpOriginAllowed(context.request, configuration.allowedOrigins)) {
		return createMcpProtocolErrorResponse({
			status: 403,
			error: 'forbidden',
			errorDescription: 'Origin is not allowed for MCP requests.',
			headers: protocolHeaders,
		});
	}
	if (context.request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: protocolHeaders });
	}
	const networkIdentity = context.socketAddress ?? 'unknown';
	const failedAuthenticationCount = await seams.rateLimiter.peek(
		'failed_authentication',
		networkIdentity,
	);
	if (failedAuthenticationCount >= configuration.maximumFailedAuthenticationAttempts) {
		return createMcpProtocolErrorResponse({
			status: 429,
			error: 'rate_limited',
			errorDescription: 'Too many failed authentication attempts. Try again later.',
			headers: protocolHeaders,
		});
	}
	const { scheme, credential } = parseAuthorizationHeader(
		context.request.headers.get('authorization'),
	);
	if (scheme?.toLowerCase() !== 'bearer') {
		return createMcpProtocolErrorResponse({
			status: 401,
			error: 'unauthorized',
			errorDescription: 'Missing or invalid Authorization header.',
			headers: {
				...protocolHeaders,
				'WWW-Authenticate': bearerChallenge(configuration),
			},
		});
	}
	const bearerToken = credential ?? '';
	if (bearerToken.length === 0 || bearerToken.length > configuration.maximumBearerTokenLength) {
		return createMcpProtocolErrorResponse({
			status: 401,
			error: 'unauthorized',
			errorDescription: 'Malformed bearer token.',
			headers: {
				...protocolHeaders,
				'WWW-Authenticate': bearerChallenge(configuration, 'invalid_token'),
			},
		});
	}
	const token = await seams.tokens.findByHash(seams.hashCredential(bearerToken));
	const now = new Date();
	if (!token || token.revokedAt || token.expiresAt <= now) {
		await seams.rateLimiter.consume('failed_authentication', networkIdentity);
		seams.recordEvent('expired_or_invalid_token', context.requestId);
		return invalidTokenResponse(configuration, corsHeaders);
	}
	if (token.resource !== configuration.resource.href) {
		await seams.rateLimiter.consume('failed_authentication', networkIdentity);
		seams.recordEvent('invalid_resource', context.requestId);
		return invalidTokenResponse(configuration, corsHeaders);
	}
	const profile = await seams.resolveUserProfile(token.userId);
	if (!profile) {
		await seams.rateLimiter.consume('failed_authentication', networkIdentity);
		seams.recordEvent('expired_or_invalid_token', context.requestId);
		return invalidTokenResponse(configuration, corsHeaders);
	}
	seams.recordEvent('success', context.requestId);
	return buildMcpAuthInfo({
		accessToken: bearerToken,
		expiresAt: token.expiresAt,
		extra: {
			userId: token.userId,
			userProfile: profile,
			oauthClientId: token.clientId,
			scopes: (token.scope ?? '').split(' ').filter(Boolean),
			resource: token.resource,
			networkIdentity,
			requestId: context.requestId,
		},
	});
}
