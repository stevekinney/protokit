import { randomUUID } from 'node:crypto';
import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';
import { getBaseUrl } from '@web/lib/base-url';
import { getContentSecurityPolicy } from '@web/lib/content-security-policy';
import { createCorsPreflightResponse, oauthCorsHeaders } from '@web/lib/cors';
import { deriveSessionCsrfToken } from '@web/lib/csrf-protection';
import { createStreamingHtmlResponse } from '@web/lib/html-response';
import { jsonResponse } from '@web/lib/http-response';
import type { RequestContext } from '@web/lib/request-context';
import { hydrateSession } from '@web/lib/session-authentication';
import { resolvePublicFile } from '@web/resolve-public-file';
import { handleDevelopmentLogin } from '@web/routes/development-authentication-routes';
import {
	handleGoogleSignInCallback,
	handleGoogleSignInStart,
	handleSignOut,
} from '@web/routes/google-authentication-routes';
import { handleHealthGet, handleHealthReadinessGet } from '@web/routes/health-routes';
import {
	handlePrivacyPolicyGet,
	handleSupportGet,
	handleTermsOfServiceGet,
} from '@web/routes/legal-routes';
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
import { getRequestClientIdentifier } from '@web/lib/request-client-identifier';
import { listUserConnections } from '@web/lib/consent-inventory';
import {
	handleAccountConnectionRevokePost,
	handleAccountConnectionsRevokeAllPost,
} from '@web/routes/account-connections-routes';
import { HomePage } from '@web/components/home-page';

function isHtmlResponse(response: Response): boolean {
	const contentType = response.headers.get('content-type') ?? '';
	return contentType.includes('text/html');
}

/**
 * Pathnames that carry OAuth transaction state (client identity, redirect
 * target, PKCE challenge, state, or the federated sign-in state cookie) in
 * the URL, form, or referring context. SEC-005 / S-17: these get
 * `Referrer-Policy: no-referrer` rather than the site-wide default, so a
 * link or subresource load from one of these pages never leaks any part of
 * that state to another origin's `Referer` header.
 */
const noReferrerPathnames = new Set([
	'/oauth/authorize',
	'/auth/google/start',
	'/auth/google/callback',
]);

/**
 * A restrictive default: this server has no legitimate use for camera,
 * microphone, geolocation, or payment APIs on any page it serves (SEC-005 /
 * S-17).
 */
const permissionsPolicy =
	'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()';

/**
 * The pure header-setting logic, taking `isProduction` as an explicit
 * parameter rather than reading `environment` directly. This lets
 * `browser-security-headers.test.ts` exercise the production branch (HSTS)
 * without mocking `@web/env` — a module several other test files also
 * mock, and Bun's `mock.module` patches the shared module registry for the
 * whole test process, so a second mock here would risk the same
 * cross-file pollution `TEST-DB-001` documented for other modules.
 */
export function applySecurityHeaders(
	inputResponse: Response,
	requestPathname: string,
	options: { isProduction: boolean },
): Response {
	inputResponse.headers.set('X-Content-Type-Options', 'nosniff');
	inputResponse.headers.set('Permissions-Policy', permissionsPolicy);
	inputResponse.headers.set(
		'Referrer-Policy',
		noReferrerPathnames.has(requestPathname) ? 'no-referrer' : 'strict-origin-when-cross-origin',
	);
	if (requestPathname === '/oauth/authorize') {
		inputResponse.headers.set('X-Frame-Options', 'DENY');
	}

	// SEC-005: HSTS only makes sense once the deployment is actually served
	// over HTTPS, which `CONFIG-001`'s startup invariants already require in
	// production. Sending it in development/test (often plain HTTP on
	// localhost) would be actively wrong — browsers that cache the header
	// would then refuse to connect over HTTP at all.
	if (options.isProduction) {
		inputResponse.headers.set(
			'Strict-Transport-Security',
			'max-age=63072000; includeSubDomains; preload',
		);
	}

	if (isHtmlResponse(inputResponse)) {
		const allowScripts = requestPathname !== '/oauth/authorize';
		inputResponse.headers.set(
			'Content-Security-Policy',
			getContentSecurityPolicy({ allowScripts }),
		);

		// SEC-005 / S-10: every HTML response this server sends is either
		// unauthenticated-but-session-dependent (the homepage renders
		// differently once signed in) or directly authenticated/credential-
		// bearing (consent, OAuth error pages). None of it is safe for a
		// shared or CDN cache to store or replay across sessions.
		if (!inputResponse.headers.has('Cache-Control')) {
			inputResponse.headers.set('Cache-Control', 'no-store, private');
			inputResponse.headers.set('Pragma', 'no-cache');
			inputResponse.headers.set('Vary', 'Cookie');
		}
	}

	return inputResponse;
}

function withSecurityHeaders(inputResponse: Response, requestPathname: string): Response {
	return applySecurityHeaders(inputResponse, requestPathname, {
		isProduction: environment.NODE_ENV === 'production',
	});
}

async function renderHomePage(context: RequestContext): Promise<Response> {
	const baseUrl = getBaseUrl(context.request);
	// SEC-005: only derived (never sent to the client) when a session
	// actually exists — the sign-out form has nothing to protect otherwise.
	const signOutCsrfToken =
		context.user && context.sessionToken ? deriveSessionCsrfToken(context.sessionToken) : undefined;
	// DATA-001 / S-18: the same session-bound CSRF token protects the
	// connections revoke forms — one token, reused, exactly like sign-out.
	const connectionsCsrfToken = signOutCsrfToken;
	const connections = context.user ? await listUserConnections(context.user.id) : [];

	return createStreamingHtmlResponse({
		metadata: { title: 'MCP OAuth Server' },
		body: (
			<HomePage
				user={context.user}
				baseUrl={baseUrl}
				signOutCsrfToken={signOutCsrfToken}
				connections={connections.map((connection) => ({
					clientId: connection.clientId,
					clientName: connection.clientName,
					earliestExpiresAt: connection.earliestExpiresAt.toISOString(),
				}))}
				connectionsCsrfToken={connectionsCsrfToken}
			/>
		),
		serverData: {
			page: 'home',
			user: context.user
				? { email: context.user.email, name: context.user.name, image: context.user.image }
				: null,
			baseUrl,
			signOutCsrfToken,
			connections: connections.map((connection) => ({
				clientId: connection.clientId,
				clientName: connection.clientName,
				earliestExpiresAt: connection.earliestExpiresAt.toISOString(),
			})),
			connectionsCsrfToken,
		},
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

	if (requestUrl.pathname === '/auth/dev/login' && request.method === 'GET') {
		return handleDevelopmentLogin(context);
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

	if (requestUrl.pathname === '/account/connections/revoke' && request.method === 'POST') {
		return handleAccountConnectionRevokePost(context);
	}

	if (requestUrl.pathname === '/account/connections/revoke-all' && request.method === 'POST') {
		return handleAccountConnectionsRevokeAllPost(context);
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

	// /.well-known/* metadata, /health, /health/ready, and /metrics are
	// dispatched by `dispatchWithoutSession` before this function ever runs
	// (see its doc comment) — none of them are reachable here.

	if (requestUrl.pathname === '/mcp') {
		return handleMcpRequestWithAuthentication(context);
	}

	return jsonResponse({ error: 'not_found' }, { status: 404 });
}

/**
 * OPS-002 / S-15: routes that never read `context.user` or
 * `context.sessionToken` — public liveness, the authenticated readiness and
 * metrics endpoints (each carries its own bearer-credential check, not a
 * browser session), the static OAuth discovery documents, and (`DOCS-001`)
 * the privacy/terms/support pages, which are equally static and equally
 * uninterested in whether the caller is signed in. Dispatched
 * before `hydrateSession` runs so none of them ever queries session
 * storage, even when sent with a cookie. Returns `null` (rather than a 404)
 * for anything else, so `handleApplicationRequest` falls through to the
 * ordinary session-hydrating `dispatch` above.
 */
function dispatchWithoutSession(context: RequestContext): Response | Promise<Response> | null {
	const { request, requestUrl } = context;

	if (requestUrl.pathname === '/health' && request.method === 'GET') {
		return handleHealthGet();
	}

	if (requestUrl.pathname === '/health/ready' && request.method === 'GET') {
		return handleHealthReadinessGet(context);
	}

	if (requestUrl.pathname === '/metrics' && request.method === 'GET') {
		return handleMetricsGet(context);
	}

	if (requestUrl.pathname === '/privacy' && request.method === 'GET') {
		return handlePrivacyPolicyGet();
	}

	if (requestUrl.pathname === '/terms' && request.method === 'GET') {
		return handleTermsOfServiceGet();
	}

	if (requestUrl.pathname === '/support' && request.method === 'GET') {
		return handleSupportGet();
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

	return null;
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

	const networkIdentity = getRequestClientIdentifier({
		request,
		socketAddress: input?.clientAddress,
	});

	// OPS-002 / S-15: try the session-free routes first. `hydrateSession`
	// (a session-store lookup) only ever runs below this point, for
	// requests that actually need `context.user` — see
	// `dispatchWithoutSession`'s doc comment.
	let context: RequestContext = {
		request,
		requestUrl,
		requestId,
		clientAddress: input?.clientAddress,
		networkIdentity,
		user: null,
		sessionToken: null,
	};

	let response: Response;
	try {
		const preSessionResponse = await dispatchWithoutSession(context);
		if (preSessionResponse) {
			response = preSessionResponse;
		} else {
			const session = await hydrateSession(request);
			context = { ...context, user: session.user, sessionToken: session.sessionToken };
			response = await dispatch(context);
		}
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
	const isHealthCheck =
		requestUrl.pathname === '/health' || requestUrl.pathname === '/health/ready';
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
