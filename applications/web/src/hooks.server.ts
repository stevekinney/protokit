import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { database, schema } from '@template/database';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { getAuthentication } from '$lib/authentication';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { hashCredential } from '$lib/hash-credential';
import { getBaseUrl } from '$lib/base-url';
import { corsHeaders } from '$lib/cors';

export const handle: Handle = async ({ event, resolve }) => {
	// MCP routes: authenticate via Bearer token
	if (event.url.pathname.startsWith('/mcp')) {
		// CORS preflight — must respond before auth check
		if (event.request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders });
		}

		const baseUrl = getBaseUrl(event);
		const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource/mcp`;

		const authorizationHeader = event.request.headers.get('authorization');
		if (!authorizationHeader?.startsWith('Bearer ')) {
			return new Response('Missing or invalid Authorization header', {
				status: 401,
				headers: {
					'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
					...corsHeaders,
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
			return new Response('Invalid or expired token', {
				status: 401,
				headers: {
					'WWW-Authenticate': `Bearer error="invalid_token", resource_metadata="${resourceMetadataUrl}"`,
					...corsHeaders,
				},
			});
		}

		event.locals.user = { id: token.userId };
		const response = await resolve(event);

		// Add CORS headers to all authenticated MCP responses
		for (const [key, value] of Object.entries(corsHeaders)) {
			response.headers.set(key, value);
		}

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
