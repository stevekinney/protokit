import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { environment } from '../../../env';

export const GET: RequestHandler = async () => {
	const baseUrl = environment.PUBLIC_APP_URL;

	return json({
		resource: `${baseUrl}/mcp`,
		authorization_servers: [baseUrl],
	});
};
