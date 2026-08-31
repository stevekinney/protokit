export function createRateLimitedResponse(
	retryAfterSeconds: number,
	headers?: Record<string, string>,
): Response {
	return Response.json(
		{ error: 'rate_limited', error_description: 'Too many requests' },
		{
			status: 429,
			headers: { ...(headers ?? {}), 'Retry-After': String(retryAfterSeconds) },
		},
	);
}
