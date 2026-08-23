import { PayloadTooLargeError, readBoundedFormUrlEncoded } from '@web/lib/bounded-request-body';
import {
	listUserConnections,
	revokeAllUserGrants,
	revokeUserClientGrant,
} from '@web/lib/consent-inventory';
import { getBaseUrl } from '@web/lib/base-url';
import { isTrustedRequestOrigin, isValidSessionCsrfToken } from '@web/lib/csrf-protection';
import { isExactContentType } from '@web/lib/exact-content-type';
import { jsonResponse, redirectResponse } from '@web/lib/http-response';
import {
	accountConnectionsMaxBodyBytes,
	oauthMaxClientIdLength,
	sessionCsrfTokenMaxLength,
} from '@web/lib/request-limits';
import type { RequestContext } from '@web/lib/request-context';

/**
 * DATA-001 / S-18: "Add a user-facing connector and consent inventory with
 * revoke-all and per-client revocation. Revocation must terminate active
 * MCP access, not merely hide a record."
 *
 * Every route here requires an active session (checked by the caller in
 * `application.tsx` before dispatch, the same convention `handleSignOut`
 * follows) and the same CSRF defenses `handleSignOut` already established
 * for a cookie-authenticated, state-changing POST: `Sec-Fetch-Site`/`Origin`
 * checked before any database work, then a session-bound CSRF token,
 * checked before the request's own body is trusted.
 */

function requireCsrfProtectedPost(context: RequestContext): Response | null {
	if (!isTrustedRequestOrigin(context.request, getBaseUrl(context.request))) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Cross-site request rejected.' },
			{ status: 403 },
		);
	}

	if (
		!isExactContentType(
			context.request.headers.get('content-type'),
			'application/x-www-form-urlencoded',
		)
	) {
		return jsonResponse({ error: 'unsupported_content_type' }, { status: 400 });
	}

	return null;
}

async function parseCsrfProtectedFormBody(
	context: RequestContext,
): Promise<URLSearchParams | Response> {
	try {
		return await readBoundedFormUrlEncoded(context.request, accountConnectionsMaxBodyBytes);
	} catch (error) {
		if (error instanceof PayloadTooLargeError) {
			return jsonResponse(
				{ error: 'invalid_request', message: 'Request body too large.' },
				{ status: 413 },
			);
		}
		return jsonResponse(
			{ error: 'invalid_request', message: 'Request body is not valid UTF-8.' },
			{ status: 400 },
		);
	}
}

export async function handleAccountConnectionsGet(context: RequestContext): Promise<Response> {
	if (!context.user) {
		return redirectResponse('/', 303);
	}

	const connections = await listUserConnections(context.user.id);
	return jsonResponse({ connections });
}

export async function handleAccountConnectionRevokePost(
	context: RequestContext,
): Promise<Response> {
	if (!context.user || !context.sessionToken) {
		return jsonResponse({ error: 'invalid_request', message: 'Not signed in.' }, { status: 401 });
	}

	const originOrContentTypeError = requireCsrfProtectedPost(context);
	if (originOrContentTypeError) {
		return originOrContentTypeError;
	}

	const formParametersOrError = await parseCsrfProtectedFormBody(context);
	if (formParametersOrError instanceof Response) {
		return formParametersOrError;
	}
	const formParameters = formParametersOrError;

	const csrfToken = formParameters.get('csrf_token');
	if (
		(csrfToken && csrfToken.length > sessionCsrfTokenMaxLength) ||
		!isValidSessionCsrfToken(context.sessionToken, csrfToken)
	) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Missing or invalid CSRF token.' },
			{ status: 403 },
		);
	}

	const clientId = formParameters.get('client_id');
	if (!clientId || clientId.length > oauthMaxClientIdLength) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Missing or invalid client_id.' },
			{ status: 400 },
		);
	}

	await revokeUserClientGrant(context.user.id, clientId);
	return redirectResponse('/', 303);
}

export async function handleAccountConnectionsRevokeAllPost(
	context: RequestContext,
): Promise<Response> {
	if (!context.user || !context.sessionToken) {
		return jsonResponse({ error: 'invalid_request', message: 'Not signed in.' }, { status: 401 });
	}

	const originOrContentTypeError = requireCsrfProtectedPost(context);
	if (originOrContentTypeError) {
		return originOrContentTypeError;
	}

	const formParametersOrError = await parseCsrfProtectedFormBody(context);
	if (formParametersOrError instanceof Response) {
		return formParametersOrError;
	}
	const formParameters = formParametersOrError;

	const csrfToken = formParameters.get('csrf_token');
	if (
		(csrfToken && csrfToken.length > sessionCsrfTokenMaxLength) ||
		!isValidSessionCsrfToken(context.sessionToken, csrfToken)
	) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Missing or invalid CSRF token.' },
			{ status: 403 },
		);
	}

	await revokeAllUserGrants(context.user.id);
	return redirectResponse('/', 303);
}
