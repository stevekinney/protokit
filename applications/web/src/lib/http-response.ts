export function jsonResponse(
	body: unknown,
	init?: {
		status?: number;
		headers?: HeadersInit;
	},
): Response {
	const responseHeaders = new Headers(init?.headers);
	if (!responseHeaders.has('Content-Type')) {
		responseHeaders.set('Content-Type', 'application/json');
	}

	return new Response(JSON.stringify(body), {
		status: init?.status,
		headers: responseHeaders,
	});
}

export function redirectResponse(location: string, status: number = 302): Response {
	return new Response(null, {
		status,
		headers: {
			Location: location,
		},
	});
}
