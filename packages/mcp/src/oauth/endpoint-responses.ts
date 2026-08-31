import { oauthCorsHeaders } from './discovery-metadata.js';
import { InvalidOauthRequestBodyError, PayloadTooLargeError } from './request-body.js';

export const oauthNoStoreHeaders = {
	...oauthCorsHeaders,
	'Cache-Control': 'no-store',
	Pragma: 'no-cache',
};

export function oauthJson(body: unknown, status = 200, headers: HeadersInit = {}): Response {
	return Response.json(body, { status, headers: { ...oauthNoStoreHeaders, ...headers } });
}

export function oauthBodyError(error: unknown): Response {
	if (error instanceof PayloadTooLargeError) {
		return oauthJson(
			{ error: 'invalid_request', error_description: 'Request body too large' },
			413,
		);
	}
	if (error instanceof InvalidOauthRequestBodyError) {
		return oauthJson(
			{
				error: error.kind,
				...(error.kind === 'invalid_request' ? { error_description: error.message } : {}),
			},
			400,
		);
	}
	return oauthJson({ error: 'invalid_request', error_description: 'Malformed request body' }, 400);
}
