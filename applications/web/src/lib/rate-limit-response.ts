import { jsonResponse } from '@web/lib/http-response';

export function createRateLimitedResponse(
	retryAfterSeconds: number,
	headers?: Record<string, string>,
): Response {
	const responseHeaders: Record<string, string> = {
		...(headers ?? {}),
		'Retry-After': String(retryAfterSeconds),
	};

	return jsonResponse(
		{ error: 'rate_limited', error_description: 'Too many requests' },
		{ status: 429, headers: responseHeaders },
	);
}
