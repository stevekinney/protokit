import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { database, schema } from '@template/database';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { authentication } from '$lib/authentication';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const handle: Handle = async ({ event, resolve }) => {
	// MCP routes: authenticate via Bearer token
	if (event.url.pathname.startsWith('/mcp')) {
		const authorizationHeader = event.request.headers.get('authorization');
		if (!authorizationHeader?.startsWith('Bearer ')) {
			return new Response('Missing or invalid Authorization header', { status: 401 });
		}

		const accessToken = authorizationHeader.slice(7);

		const [token] = await database
			.select()
			.from(schema.oauthTokens)
			.where(
				and(
					eq(schema.oauthTokens.accessToken, accessToken),
					isNull(schema.oauthTokens.revokedAt),
					gt(schema.oauthTokens.expiresAt, new Date()),
				),
			)
			.limit(1);

		if (!token) {
			return new Response('Invalid or expired token', { status: 401 });
		}

		event.locals.user = { id: token.userId };
		return resolve(event);
	}

	// All other routes: populate session and user from Better Auth
	const session = await authentication.api.getSession({
		headers: event.request.headers,
	});

	event.locals.session = session?.session ?? null;
	event.locals.user = session?.user ?? null;

	// Delegate to Better Auth handler for /api/auth/* routes
	return svelteKitHandler({ event, resolve, auth: authentication, building });
};
