import { randomUUID } from 'node:crypto';
import { logger } from '@template/mcp/logger';
import { getBaseUrl } from '@web/lib/base-url';
import { createCorsPreflightResponse, oauthCorsHeaders } from '@web/lib/cors';
import { createHtmlResponse } from '@web/lib/html-response';
import { jsonResponse } from '@web/lib/http-response';
import type { RequestContext } from '@web/lib/request-context';
import { hydrateSession } from '@web/lib/session-authentication';
import { resolvePublicFile } from '@web/resolve-public-file';
import {
	handleGoogleSignInCallback,
	handleGoogleSignInStart,
	handleSignOut,
} from '@web/routes/google-authentication-routes';
import { handleHealthGet } from '@web/routes/health-routes';
import { handleMetricsGet } from '@web/routes/metrics-routes';
import { handleMcpRequestWithAuthentication } from '@web/routes/mcp-routes';
import {
	handleOauthAuthorizationMetadataGet,
	handleOauthAuthorizeApprove,
	handleOauthAuthorizeDeny,
	handleOauthAuthorizeGet,
	handleOauthProtectedResourceMcpMetadataGet,
	handleOauthProtectedResourceMetadataGet,
	handleOauthRegisterPost,
	handleOauthRevokePost,
	handleOauthTokenPost,
} from '@web/routes/oauth-routes';
import { HomePage } from '@web/views/home-page';

const defaultContentSecurityPolicy =
	"default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";

function isHtmlResponse(response: Response): boolean {
	const contentType = response.headers.get('content-type') ?? '';
	return contentType.includes('text/html');
}

function withSecurityHeaders(inputResponse: Response, requestPathname: string): Response {
	inputResponse.headers.set('X-Content-Type-Options', 'nosniff');
	inputResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	if (requestPathname === '/oauth/authorize') {
		inputResponse.headers.set('X-Frame-Options', 'DENY');
	}

	if (isHtmlResponse(inputResponse)) {
		inputResponse.headers.set('Content-Security-Policy', defaultContentSecurityPolicy);
	}

	return inputResponse;
}

async function renderHomePage(context: RequestContext): Promise<Response> {
	return createHtmlResponse({
		title: 'MCP OAuth Server',
		body: <HomePage user={context.user} baseUrl={getBaseUrl(context.request)} />,
	});
}

async function serveStaticFile(pathname: string): Promise<Response | null> {
	if (!pathname.startsWith('/assets/') && pathname !== '/favicon.png') {
		return null;
	}

	const staticFile = await resolvePublicFile(pathname.slice(1));
	if (!staticFile) return null;

	const response = new Response(staticFile, {
		headers: { 'Content-Type': staticFile.type },
	});
	if (pathname.startsWith('/assets/')) {
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
	}

	return response;
}

async function dispatch(context: RequestContext): Promise<Response> {
	const { request, requestUrl } = context;

	if (requestUrl.pathname === '/' && request.method === 'GET') {
		return renderHomePage(context);
	}

	if (requestUrl.pathname === '/auth/google/start' && request.method === 'GET') {
		return handleGoogleSignInStart(context);
	}

	if (requestUrl.pathname === '/auth/google/callback' && request.method === 'GET') {
		return handleGoogleSignInCallback(context);
	}

	if (requestUrl.pathname === '/auth/sign-out' && request.method === 'POST') {
		return handleSignOut(context);
	}

	if (requestUrl.pathname === '/oauth/authorize' && request.method === 'GET') {
		return handleOauthAuthorizeGet(context);
	}

	if (requestUrl.pathname === '/oauth/authorize/approve' && request.method === 'POST') {
		return handleOauthAuthorizeApprove(context);
	}

	if (requestUrl.pathname === '/oauth/authorize/deny' && request.method === 'POST') {
		return handleOauthAuthorizeDeny(context);
	}

	if (requestUrl.pathname === '/oauth/register' && request.method === 'OPTIONS') {
		return createCorsPreflightResponse(oauthCorsHeaders);
	}

	if (requestUrl.pathname === '/oauth/register' && request.method === 'POST') {
		return handleOauthRegisterPost(context);
	}

	if (requestUrl.pathname === '/oauth/token' && request.method === 'OPTIONS') {
		return createCorsPreflightResponse(oauthCorsHeaders);
	}

	if (requestUrl.pathname === '/oauth/token' && request.method === 'POST') {
		return handleOauthTokenPost(context);
	}

	if (requestUrl.pathname === '/oauth/revoke' && request.method === 'OPTIONS') {
		return createCorsPreflightResponse(oauthCorsHeaders);
	}

	if (requestUrl.pathname === '/oauth/revoke' && request.method === 'POST') {
		return handleOauthRevokePost(context);
	}

	if (
		requestUrl.pathname === '/.well-known/oauth-authorization-server' &&
		(request.method === 'GET' || request.method === 'OPTIONS')
	) {
		if (request.method === 'OPTIONS') {
			return createCorsPreflightResponse(oauthCorsHeaders);
		}
		return handleOauthAuthorizationMetadataGet(context);
	}

	if (
		requestUrl.pathname === '/.well-known/oauth-protected-resource' &&
		(request.method === 'GET' || request.method === 'OPTIONS')
	) {
		if (request.method === 'OPTIONS') {
			return createCorsPreflightResponse(oauthCorsHeaders);
		}
		return handleOauthProtectedResourceMetadataGet(context);
	}

	if (
		requestUrl.pathname === '/.well-known/oauth-protected-resource/mcp' &&
		(request.method === 'GET' || request.method === 'OPTIONS')
	) {
		if (request.method === 'OPTIONS') {
			return createCorsPreflightResponse(oauthCorsHeaders);
		}
		return handleOauthProtectedResourceMcpMetadataGet(context);
	}

	if (requestUrl.pathname === '/health' && request.method === 'GET') {
		return handleHealthGet();
	}

	if (requestUrl.pathname === '/metrics' && request.method === 'GET') {
		return handleMetricsGet();
	}

	if (requestUrl.pathname === '/mcp') {
		return handleMcpRequestWithAuthentication(context);
	}

	return jsonResponse({ error: 'not_found' }, { status: 404 });
}

export async function handleApplicationRequest(
	request: Request,
	input?: { clientAddress?: string },
): Promise<Response> {
	const requestId = randomUUID();
	const requestUrl = new URL(request.url);
	const startTime = Date.now();

	const staticFileResponse = await serveStaticFile(requestUrl.pathname);
	if (staticFileResponse) {
		return withSecurityHeaders(staticFileResponse, requestUrl.pathname);
	}

	const session = await hydrateSession(request);
	const context: RequestContext = {
		request,
		requestUrl,
		requestId,
		clientAddress: input?.clientAddress,
		user: session.user,
		sessionToken: session.sessionToken,
	};

	let response: Response;
	try {
		response = await dispatch(context);
	} catch (error) {
		logger.error(
			{ err: error, requestId, method: request.method, path: requestUrl.pathname },
			'Unhandled error in request dispatch',
		);
		response = jsonResponse(
			{ error: 'internal_error', error_description: 'An unexpected error occurred' },
			{ status: 500 },
		);
	}

	const durationMs = Date.now() - startTime;
	const isHealthCheck = requestUrl.pathname === '/health';
	if (!isHealthCheck) {
		logger.info(
			{
				requestId,
				method: request.method,
				path: requestUrl.pathname,
				status: response.status,
				durationMs,
				userId: context.user?.id,
			},
			'Request handled',
		);
	}

	response.headers.set('X-Request-Id', requestId);
	return withSecurityHeaders(response, requestUrl.pathname);
}
