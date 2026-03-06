import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBaseUrl } from '$lib/base-url';
import { corsHeaders, handleCorsPreflight } from '$lib/cors';

export const OPTIONS = handleCorsPreflight;

export const GET: RequestHandler = async (event) => {
	const baseUrl = getBaseUrl(event);

	return json(
		{
			issuer: baseUrl,
			authorization_endpoint: `${baseUrl}/authorize`,
			token_endpoint: `${baseUrl}/token`,
			registration_endpoint: `${baseUrl}/register`,
			response_types_supported: ['code'],
			grant_types_supported: ['authorization_code', 'refresh_token'],
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
		},
		{ headers: corsHeaders },
	);
};
