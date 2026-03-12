import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBaseUrl } from '$lib/base-url';
import { corsHeaders, handleCorsPreflight } from '$lib/cors';
import { mcpProtocolVersion } from '$lib/mcp-protocol-constants';

export const OPTIONS = handleCorsPreflight;

export const GET: RequestHandler = async (event) => {
	const baseUrl = getBaseUrl(event);

	return json(
		{
			resource: `${baseUrl}/mcp`,
			authorization_servers: [baseUrl],
			bearer_methods_supported: ['header'],
			mcp_protocol_version: mcpProtocolVersion,
		},
		{ headers: corsHeaders },
	);
};
