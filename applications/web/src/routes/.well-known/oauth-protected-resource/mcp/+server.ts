import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBaseUrl } from '$lib/base-url';
import { corsHeaders, handleCorsPreflight } from '$lib/cors';

export const OPTIONS = handleCorsPreflight;

export const GET: RequestHandler = async (event) => {
	const baseUrl = getBaseUrl(event);

	return json(
		{
			resource: `${baseUrl}/mcp`,
			authorization_servers: [baseUrl],
		},
		{ headers: corsHeaders },
	);
};
