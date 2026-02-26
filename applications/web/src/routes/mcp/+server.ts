import type { RequestHandler } from './$types';
import { handleMcpRequest } from '$lib/mcp-handler';
import { error } from '@sveltejs/kit';

const handler: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}
	return handleMcpRequest(request, locals.user.id);
};

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
