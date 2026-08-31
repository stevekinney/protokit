export type McpProtocolErrorCode =
	| 'bad_request'
	| 'unauthorized'
	| 'forbidden'
	| 'not_found'
	| 'session_affinity_required'
	| 'unsupported_media_type'
	| 'not_acceptable'
	| 'rate_limited'
	| 'payload_too_large'
	| 'internal_error';

export function createMcpProtocolErrorResponse(input: {
	status: number;
	error: McpProtocolErrorCode;
	errorDescription: string;
	headers?: Record<string, string>;
	data?: Record<string, unknown>;
}): Response {
	return new Response(
		JSON.stringify({
			error: input.error,
			error_description: input.errorDescription,
			status: input.status,
			...(input.data ? { data: input.data } : {}),
		}),
		{
			status: input.status,
			headers: { 'Content-Type': 'application/json', ...(input.headers ?? {}) },
		},
	);
}

export function createMcpCorsHeaders(
	request: Request,
	allowedOrigins: ReadonlySet<string>,
): Record<string, string> {
	const origin = request.headers.get('origin');
	if (!origin || origin === 'null' || !allowedOrigins.has(origin)) return {};
	return {
		'Access-Control-Allow-Origin': origin,
		Vary: 'Origin',
		'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
		'Access-Control-Allow-Headers':
			'Content-Type, Authorization, mcp-session-id, mcp-protocol-version, Last-Event-ID',
		'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
	};
}

export function isMcpOriginAllowed(request: Request, allowedOrigins: ReadonlySet<string>): boolean {
	const origin = request.headers.get('origin');
	return !origin || (origin !== 'null' && allowedOrigins.has(origin));
}

export function createRateLimitedResponse(
	retryAfterSeconds: number,
	headers: Record<string, string>,
): Response {
	return createMcpProtocolErrorResponse({
		status: 429,
		error: 'rate_limited',
		errorDescription: 'Too many requests. Try again later.',
		headers: { ...headers, 'Retry-After': String(retryAfterSeconds) },
	});
}
