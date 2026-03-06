import type { RequestHandler } from './$types';
import { getAuthentication } from '$lib/authentication';

/**
 * GET endpoint that wraps Better Auth's POST-only social sign-in.
 *
 * This exists because Better Auth's `/api/auth/sign-in/social` only accepts
 * POST requests, but the authorize page needs to redirect the browser (which
 * sends a GET). This endpoint calls the API server-side and returns a proper
 * 302 redirect with the Set-Cookie headers Better Auth needs for OAuth state
 * verification.
 */
export const GET: RequestHandler = async ({ url, request }) => {
	const provider = url.searchParams.get('provider') || 'google';
	const callbackURL = url.searchParams.get('callbackURL') || '/';

	const response = await getAuthentication().api.signInSocial({
		body: { provider, callbackURL },
		asResponse: true,
		headers: request.headers,
	});

	const data = await response.json();

	const headers = new Headers();
	headers.set('Location', data.url);

	for (const cookie of response.headers.getSetCookie()) {
		headers.append('Set-Cookie', cookie);
	}

	return new Response(null, { status: 302, headers });
};
