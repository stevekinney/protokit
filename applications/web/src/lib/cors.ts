import type { RequestHandler } from '@sveltejs/kit';

export const corsHeaders: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handleCorsPreflight: RequestHandler = async () => {
	return new Response(null, { status: 204, headers: corsHeaders });
};
