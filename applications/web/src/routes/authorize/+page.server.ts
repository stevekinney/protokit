import { redirect, fail } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';
import { database, schema } from '@template/database';
import { eq } from 'drizzle-orm';
import { isValidRedirectUri } from '$lib/validate-redirect-uri';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		const returnUrl = url.pathname + url.search;
		redirect(
			302,
			`/api/auth/sign-in/social?provider=google&callbackURL=${encodeURIComponent(returnUrl)}`,
		);
	}

	const clientId = url.searchParams.get('client_id');
	const redirectUri = url.searchParams.get('redirect_uri');
	const responseType = url.searchParams.get('response_type');
	const codeChallenge = url.searchParams.get('code_challenge');
	const codeChallengeMethod = url.searchParams.get('code_challenge_method');
	const state = url.searchParams.get('state');
	const scope = url.searchParams.get('scope') || '';

	if (!clientId || !redirectUri || responseType !== 'code' || !codeChallenge) {
		return { error: 'Invalid OAuth parameters. Missing required fields.' };
	}

	if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
		return { error: 'Only S256 code challenge method is supported.' };
	}

	const [client] = await database
		.select()
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientId, clientId))
		.limit(1);

	if (!client) {
		return { error: 'Unknown client.' };
	}

	if (client.redirectUris.length > 0 && !client.redirectUris.includes(redirectUri)) {
		return { error: 'Invalid redirect URI.' };
	}

	return {
		clientName: client.clientName,
		clientId,
		redirectUri,
		codeChallenge,
		codeChallengeMethod: codeChallengeMethod || 'S256',
		state,
		scope,
		user: locals.user,
	};
};

function getFormString(formData: FormData, key: string): string | null {
	const value = formData.get(key);
	if (typeof value !== 'string') return null;
	return value;
}

async function validateRedirectUri(clientId: string, redirectUri: string): Promise<boolean> {
	if (!isValidRedirectUri(redirectUri)) return false;

	const [client] = await database
		.select()
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientId, clientId))
		.limit(1);

	if (!client) return false;
	if (client.redirectUris.length === 0) return true;
	return client.redirectUris.includes(redirectUri);
}

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { message: 'Not authenticated' });
		}

		const formData = await request.formData();
		const clientId = getFormString(formData, 'client_id');
		const redirectUri = getFormString(formData, 'redirect_uri');
		const codeChallenge = getFormString(formData, 'code_challenge');
		const codeChallengeMethod = getFormString(formData, 'code_challenge_method') || 'S256';
		const state = getFormString(formData, 'state');
		const scope = getFormString(formData, 'scope') || '';

		if (!clientId || !redirectUri || !codeChallenge) {
			return fail(400, { message: 'Missing required fields' });
		}

		// Re-validate redirect_uri against registered client (prevents open redirect)
		const validRedirect = await validateRedirectUri(clientId, redirectUri);
		if (!validRedirect) {
			return fail(400, { message: 'Invalid redirect URI for this client' });
		}

		const code = randomBytes(32).toString('hex');
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

		await database.insert(schema.oauthCodes).values({
			code,
			clientId,
			userId: locals.user.id,
			redirectUri,
			codeChallenge,
			codeChallengeMethod,
			scope,
			state,
			expiresAt,
		});

		const redirectUrl = new URL(redirectUri);
		redirectUrl.searchParams.set('code', code);
		if (state) {
			redirectUrl.searchParams.set('state', state);
		}

		redirect(302, redirectUrl.toString());
	},

	deny: async ({ request }) => {
		const formData = await request.formData();
		const clientId = getFormString(formData, 'client_id');
		const redirectUri = getFormString(formData, 'redirect_uri');
		const state = getFormString(formData, 'state');

		if (!clientId || !redirectUri) {
			return fail(400, { message: 'Missing redirect URI' });
		}

		// Re-validate redirect_uri against registered client (prevents open redirect)
		const validRedirect = await validateRedirectUri(clientId, redirectUri);
		if (!validRedirect) {
			return fail(400, { message: 'Invalid redirect URI for this client' });
		}

		const redirectUrl = new URL(redirectUri);
		redirectUrl.searchParams.set('error', 'access_denied');
		redirectUrl.searchParams.set('error_description', 'The user denied the authorization request');
		if (state) {
			redirectUrl.searchParams.set('state', state);
		}

		redirect(302, redirectUrl.toString());
	},
};
