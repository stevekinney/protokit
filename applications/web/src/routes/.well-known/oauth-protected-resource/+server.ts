import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { environment } from '../../../env';
import { corsHeaders, handleCorsPreflight } from '$lib/cors';

export const OPTIONS = handleCorsPreflight;

export const GET: RequestHandler = async () => {
	const baseUrl = environment.PUBLIC_APP_URL;

	return json(
		{
			resource: `${baseUrl}/mcp`,
			authorization_servers: [baseUrl],
		},
		{ headers: corsHeaders },
	);
};
