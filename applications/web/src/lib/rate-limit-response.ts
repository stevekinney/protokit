import { json } from '@sveltejs/kit';

export function createRateLimitedResponse(
	retryAfterSeconds: number,
	headers?: Record<string, string>,
): Response {
	const responseHeaders: Record<string, string> = {
		...(headers ?? {}),
		'Retry-After': String(retryAfterSeconds),
	};

	return json(
		{ error: 'rate_limited', error_description: 'Too many requests' },
		{ status: 429, headers: responseHeaders },
	);
}
