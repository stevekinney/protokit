import { parseAuthorizationHeader } from '@web/lib/authorization-header';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { database, schema } from '@template/database';
import {
	getSupportedScopes,
	isLoopbackHostname,
	hasValidLocalhostRebindingHeaders,
} from '@lostgradient/mcp';
import { templateRegistry } from '@lostgradient/mcp';
import { logger } from '@lostgradient/mcp/logger';
import { metricsCollector } from '@lostgradient/mcp/metrics';
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
import {
	acquireMcpConcurrencySlot,
	attachConcurrencySlotToResponseLifetime,
} from '@web/lib/mcp-concurrency-limiter';
import { createRateLimitedResponse } from '@lostgradient/mcp/rate-limit';
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
 * (`getSupportedScopes(templateRegistry)`, shared with `oauth-routes.ts`).
 */
function bearerChallenge(resourceMetadataUrl: string, errorCode?: string): string {
	const parts = [
		...(errorCode ? [`error="${errorCode}"`] : []),
		`resource_metadata="${resourceMetadataUrl}"`,
		`scope="${getSupportedScopes(templateRegistry).join(' ')}"`,
	];
	return `Bearer ${parts.join(', ')}`;
}

/**
 * SEC-002: whether the localhost DNS-rebinding check below should be
 * enforced. This used to be inverted -- gated ON `MCP_CONFORMANCE_MODE`,
 * so a normal (non-conformance) local run had no rebinding protection at
 * all, which is backwards: the roadmap requires protection active
 * *outside* conformance mode, not only during it.
 *
 * Two carve-outs are load-bearing, not incidental:
 * - `MCP_CONFORMANCE_MODE`: conformance fixtures are dev/test-only surface
 *   area (see `mcp-handler.ts`'s `shouldEnableConformanceMode`) and a
 *   conformance client may legitimately probe this endpoint with
 *   synthetic Host/Origin combinations as part of exercising the protocol
 *   surface; the check would otherwise reject the very traffic that mode
 *   exists to serve.
 * - `PROTOKIT_TUNNEL_ACTIVE`: a Cloudflare tunnel proxies a real, external
 *   caller (e.g. a hosted connector) to this loopback-bound dev server.
 *   The origin server sees a loopback `Host` (the tunnel dials
 *   `http://localhost:PORT`) but a genuinely external `Origin` (the
 *   caller's real page origin) -- exactly the shape
 *   `hasValidLocalhostRebindingHeaders` is designed to reject. Enforcing
 *   it during an active tunnel would 403 every legitimate tunneled
 *   request. `validateMcpRequestOrigin`'s allow-listed-origin check below
 *   is the control that actually protects a tunneled deployment; the
 *   operator is expected to configure `MCP_ALLOWED_ORIGINS` to match
 *   whichever host is calling through the tunnel.
 *
 * Production is excluded implicitly, not by a third flag: a public
 * deployment's `requestUrl.hostname` is its real domain, never loopback,
 * so `isLoopbackHostname` below is already false there.
 */
export function isDnsRebindingProtectionActive(input: {
	conformanceModeConfigured: boolean;
	tunnelActive: boolean;
}): boolean {
	return !input.conformanceModeConfigured && !input.tunnelActive;
}

async function authenticateMcpUser(context: RequestContext): Promise<Response | AuthInfo> {
	const mcpCorsHeaders = createMcpCorsHeaders(context.request);

	if (
		isDnsRebindingProtectionActive({
			conformanceModeConfigured: environment.mcpConformanceMode,
			tunnelActive: environment.protokitTunnelActive,
		}) &&
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

	// Round 10 review (P2, sibling of the fix on
	// `bearer-credential-authentication.ts`'s `checkBearerCredential` --
	// same RFC 7235 §2.1 case-insensitive-scheme defect, same shape,
	// flagged explicitly here per this pull request's standing lesson that
	// a fix on one path while its sibling goes untouched keeps recurring).
	// Parses the scheme independently of the credential and compares it
	// case-insensitively; the token itself is never lowercased.
	const authorizationHeader = context.request.headers.get('authorization');
	const { scheme: authorizationScheme, credential: accessToken } =
		parseAuthorizationHeader(authorizationHeader);
	if (authorizationScheme?.toLowerCase() !== 'bearer') {
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

	// `authorizationScheme` matched `'bearer'` above, which only happens when
	// `parseAuthorizationHeader` matched its whitespace-separated pattern, so
	// `accessToken` is always a defined string here (possibly empty).
	const bearerToken = accessToken ?? '';
	if (bearerToken.length === 0 || bearerToken.length > mcpMaxBearerTokenLength) {
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

	// OPEN-12: the token lookup and the profile lookup `mcp-handler.ts`'s
	// per-request server factory used to run separately are joined into one
	// query here, one database round trip instead of two sequential ones. An
	// `INNER JOIN` (not `LEFT JOIN`) is deliberate: `oauth_tokens.user_id`
	// carries `onDelete: 'cascade'` against `users.id`
	// (`packages/database/src/schema.ts`), so a token row can never survive
	// its user's deletion -- a token match with no user match is not a real
	// state this schema can produce, and folding that impossibility into
	// "token not found" (below) is simpler than inventing a third outcome
	// for it.
	const accessTokenHash = hashCredential(bearerToken);
	const [oauthToken] = await database
		.select({
			accessToken: schema.oauthTokens.accessToken,
			clientId: schema.oauthTokens.clientId,
			userId: schema.oauthTokens.userId,
			scope: schema.oauthTokens.scope,
			resource: schema.oauthTokens.resource,
			expiresAt: schema.oauthTokens.expiresAt,
			userEmail: schema.users.email,
			userName: schema.users.name,
			userImage: schema.users.image,
			userRole: schema.users.role,
		})
		.from(schema.oauthTokens)
		.innerJoin(schema.users, eq(schema.users.id, schema.oauthTokens.userId))
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
		// OBS-001: distinguishable from "invalid resource" below via the log
		// stream even though both intentionally return the identical wire
		// response (RFC 6750 §3.1 — collapsing them prevents a caller from
		// probing which failure reason applies). Never logs the token itself.
		logger.warn(
			{
				event: 'mcp_authentication',
				outcome: 'expired_or_invalid_token',
				requestId: context.requestId,
			},
			'MCP request rejected: token not found, revoked, or expired',
		);
		metricsCollector.recordEvent('authorization', 'expired_or_invalid_token');
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
		// OBS-001: distinguishable from "expired or invalid token" above via
		// the log stream — see the comment on that branch for why the wire
		// response is deliberately identical.
		logger.warn(
			{ event: 'mcp_authentication', outcome: 'invalid_resource', requestId: context.requestId },
			'MCP request rejected: token audience does not match this resource',
		);
		metricsCollector.recordEvent('authorization', 'invalid_resource');
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

	metricsCollector.recordEvent('authorization', 'success');

	return buildMcpAuthInfo({
		accessToken: bearerToken,
		expiresAt: oauthToken.expiresAt,
		extra: {
			userId: oauthToken.userId,
			userProfile: {
				id: oauthToken.userId,
				email: oauthToken.userEmail,
				name: oauthToken.userName,
				image: oauthToken.userImage,
				role: oauthToken.userRole,
			},
			oauthClientId: oauthToken.clientId,
			scopes: (oauthToken.scope ?? '').split(' ').filter((scope) => scope.length > 0),
			resource: oauthToken.resource,
			networkIdentity: context.networkIdentity,
			requestId: context.requestId,
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

	let response: Response;
	try {
		response = await handleMcpRequest(context.request, authenticationResult);
	} catch (error) {
		// A review finding (P2): the old `finally { await concurrencySlot.release() }`
		// released the slot the instant `handleMcpRequest` resolved -- for a
		// `subscriptions/listen` response, that is the moment the SSE stream
		// is *opened*, not when it closes, so the concurrency cap was never
		// actually enforced against a long-lived stream. The happy path now
		// defers release to the response's own body-stream lifetime (below);
		// this catch is the only remaining path where `handleMcpRequest`
		// never produced a `Response` to attach that lifetime to, so the
		// slot must be released here instead.
		await concurrencySlot.release();
		throw error;
	}
	for (const [headerName, headerValue] of Object.entries(mcpCorsHeaders)) {
		response.headers.set(headerName, headerValue);
	}
	return attachConcurrencySlotToResponseLifetime(response, concurrencySlot);
}
