import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { database, schema } from '@template/database';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { getAuthentication } from '$lib/authentication';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { hashCredential } from '$lib/hash-credential';
import { getBaseUrl } from '$lib/base-url';
import { isLoopbackHostname, hasValidLocalhostRebindingHeaders } from '@template/mcp';
import { createMcpCorsHeaders, validateMcpRequestOrigin } from '$lib/mcp-origin-validation';
import { createMcpProtocolErrorResponse } from '$lib/mcp-protocol-error-response';
import { mcpProtocolVersion } from '$lib/mcp-protocol-constants';
import { evaluateEnterpriseAuthorizationPolicy } from '$lib/enterprise-authorization-policy';
import { environment as webEnvironment } from './env.js';

export const handle: Handle = async ({ event, resolve }) => {
	// MCP routes: authenticate via Bearer token
	if (event.url.pathname.startsWith('/mcp')) {
		const mcpCorsHeaders = createMcpCorsHeaders(event.request);
		if (
			webEnvironment.MCP_CONFORMANCE_MODE &&
			isLoopbackHostname(event.url.hostname) &&
			!hasValidLocalhostRebindingHeaders(event.request.headers)
		) {
			return createMcpProtocolErrorResponse({
				status: 403,
				error: 'forbidden',
				errorDescription: 'Request rejected by localhost DNS rebinding protection.',
				headers: { ...mcpCorsHeaders, 'MCP-Protocol-Version': mcpProtocolVersion },
			});
		}

		// CORS preflight — must respond before auth check
		if (event.request.method === 'OPTIONS') {
			const originValidation = validateMcpRequestOrigin(event.request);
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

		const baseUrl = getBaseUrl(event);
		const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource/mcp`;

		const authorizationHeader = event.request.headers.get('authorization');
		if (!authorizationHeader?.startsWith('Bearer ')) {
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
		const tokenHash = hashCredential(accessToken);

		const [token] = await database
			.select()
			.from(schema.oauthTokens)
			.where(
				and(
					eq(schema.oauthTokens.accessToken, tokenHash),
					isNull(schema.oauthTokens.revokedAt),
					gt(schema.oauthTokens.expiresAt, new Date()),
				),
			)
			.limit(1);

		if (!token) {
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
			clientId: token.clientId,
			userId: token.userId,
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

		event.locals.user = { id: token.userId };
		const response = await resolve(event);

		// Add CORS headers to all authenticated MCP responses
		for (const [key, value] of Object.entries(mcpCorsHeaders)) {
			response.headers.set(key, value);
		}
		response.headers.set('MCP-Protocol-Version', mcpProtocolVersion);

		response.headers.set('X-Content-Type-Options', 'nosniff');

		return response;
	}

	// All other routes: populate session and user from Better Auth
	const session = await getAuthentication().api.getSession({
		headers: event.request.headers,
	});

	event.locals.session = session?.session ?? null;
	event.locals.user = session?.user ?? null;

	// Delegate to Better Auth handler for /api/auth/* routes
	const response = await svelteKitHandler({
		event,
		resolve,
		auth: getAuthentication(),
		building,
	});

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	if (event.url.pathname === '/authorize') {
		response.headers.set('X-Frame-Options', 'DENY');
	}

	return response;
};
