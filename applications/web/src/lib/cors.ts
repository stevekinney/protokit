export function createCorsPreflightResponse(headers: HeadersInit): Response {
	return new Response(null, {
		status: 204,
		headers,
	});
}
