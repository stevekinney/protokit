type McpProtocolErrorCode =
	| 'bad_request'
	| 'unauthorized'
	| 'forbidden'
	| 'not_found'
	| 'session_affinity_required'
	| 'unsupported_media_type'
	| 'not_acceptable'
	| 'rate_limited'
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
			headers: {
				'Content-Type': 'application/json',
				...(input.headers ?? {}),
			},
		},
	);
}
