import type { RequestHandler } from '@sveltejs/kit';

export const corsHeaders: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers':
		'Content-Type, Authorization, mcp-session-id, mcp-protocol-version, Last-Event-ID',
	'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
};

export const handleCorsPreflight: RequestHandler = async () => {
	return new Response(null, { status: 204, headers: corsHeaders });
};
