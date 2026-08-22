import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';
import { PayloadTooLargeError, readBoundedFormUrlEncoded } from '@web/lib/bounded-request-body';
import { getBaseUrl } from '@web/lib/base-url';
import { isTrustedRequestOrigin, isValidSessionCsrfToken } from '@web/lib/csrf-protection';
import { isExactContentType } from '@web/lib/exact-content-type';
import {
	clearGoogleStateCookie,
	createGoogleSignInRedirectResponse,
	exchangeGoogleCodeForTokens,
	getGoogleUserProfile,
	resolveGoogleOauthCallbackCookieName,
	validateGoogleCallbackState,
} from '@web/lib/google-authentication';
import { validateGoogleIdToken } from '@web/lib/google-id-token';
import { createStaticHtmlResponse } from '@web/lib/html-response';
import { jsonResponse, redirectResponse } from '@web/lib/http-response';
import { createRateLimitedResponse } from '@web/lib/rate-limit-response';
import type { RequestContext } from '@web/lib/request-context';
import {
	enforceGoogleAuthRateLimit,
	enforceSessionCreationRateLimit,
} from '@web/lib/request-rate-limiter';
import { sessionCsrfTokenMaxLength, signOutMaxBodyBytes } from '@web/lib/request-limits';
import {
	createExpiredSessionCookie,
	createSession,
	revokeSession,
} from '@web/lib/session-authentication';
import { OauthAuthorizePage } from '@web/views/oauth-authorize-page';

function isGoogleAuthConfigured(): boolean {
	return Boolean(environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET);
}

function googleAuthNotConfiguredResponse(): Response {
	return createStaticHtmlResponse({
		metadata: { title: 'Google Sign-In Not Configured' },
		status: 503,
		body: (
			<OauthAuthorizePage
				mode="error"
				error="Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or use /auth/dev/login in development."
			/>
		),
	});
}

const GOOGLE_IDENTITY_CONFLICT_ERROR = 'google_identity_conflict';

function isUniqueConstraintViolation(error: unknown): boolean {
	return error instanceof Error && 'code' in error && (error as { code: string }).code === '23505';
}

async function upsertGoogleUser(input: {
	subject: string;
	email: string;
	name: string;
	image: string | null;
}): Promise<string> {
	// FEDAUTH-001: normalize once, here, at the single choke point every
	// uniqueness decision below goes through — Google's own `email` claim is
	// not guaranteed to arrive in one consistent case.
	const normalizedEmail = input.email.toLowerCase();

	const [existingGoogleAccount] = await database
		.select({ userId: schema.userGoogleAccounts.userId })
		.from(schema.userGoogleAccounts)
		.where(eq(schema.userGoogleAccounts.googleSubject, input.subject))
		.limit(1);

	if (existingGoogleAccount) {
		try {
			await database
				.update(schema.users)
				.set({
					email: normalizedEmail,
					name: input.name,
					image: input.image,
					emailVerified: true,
					updatedAt: new Date(),
				})
				.where(eq(schema.users.id, existingGoogleAccount.userId));
		} catch (error) {
			if (isUniqueConstraintViolation(error)) {
				throw new Error(GOOGLE_IDENTITY_CONFLICT_ERROR, { cause: error });
			}
			throw error;
		}
		await database
			.update(schema.userGoogleAccounts)
			.set({
				email: normalizedEmail,
				updatedAt: new Date(),
			})
			.where(eq(schema.userGoogleAccounts.googleSubject, input.subject));
		return existingGoogleAccount.userId;
	}

	const [existingUser] = await database
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.email, normalizedEmail))
		.limit(1);
	if (existingUser) {
		throw new Error(GOOGLE_IDENTITY_CONFLICT_ERROR);
	}

	// FEDAUTH-001: `database.transaction()` throws "No transactions support
	// in neon-http driver" against the installed driver (confirmed directly;
	// `oauth-routes.tsx`'s OAUTH-003 hit and documented the same constraint),
	// so these two inserts cannot be wrapped in a real transaction. If the
	// second insert fails, best-effort delete the user row this request just
	// created rather than leave an orphaned account no Google identity can
	// ever sign into again — not atomic, but strictly better than a silent
	// orphan.
	const userId = randomUUID();
	await database.insert(schema.users).values({
		id: userId,
		email: normalizedEmail,
		name: input.name,
		image: input.image,
		emailVerified: true,
		role: 'user',
	});

	try {
		await database.insert(schema.userGoogleAccounts).values({
			googleSubject: input.subject,
			userId,
			email: normalizedEmail,
		});
	} catch (error) {
		try {
			await database.delete(schema.users).where(eq(schema.users.id, userId));
		} catch (cleanupError) {
			logger.error(
				{ err: cleanupError, userId },
				'Failed to clean up orphaned user row after a failed Google account insert',
			);
		}

		if (isUniqueConstraintViolation(error)) {
			throw new Error(GOOGLE_IDENTITY_CONFLICT_ERROR, { cause: error });
		}
		throw error;
	}

	return userId;
}

export async function handleGoogleSignInStart(context: RequestContext): Promise<Response> {
	const rateLimitResult = await enforceGoogleAuthRateLimit({
		networkIdentity: context.networkIdentity,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds);
	}

	if (!isGoogleAuthConfigured()) return googleAuthNotConfiguredResponse();
	return createGoogleSignInRedirectResponse(context.request);
}

export async function handleGoogleSignInCallback(context: RequestContext): Promise<Response> {
	const rateLimitResult = await enforceGoogleAuthRateLimit({
		networkIdentity: context.networkIdentity,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds);
	}

	if (!isGoogleAuthConfigured()) return googleAuthNotConfiguredResponse();
	const requestUrl = context.requestUrl;
	const code = requestUrl.searchParams.get('code');

	// FEDAUTH-001: derived from the query string alone, before any signature
	// or single-use check, so every terminal path below — success or any
	// error — can clear the one cookie this specific attempt used. `null`
	// only when `state` itself is missing or malformed, in which case there
	// is no specific cookie this server can identify as belonging here.
	const cookieNameToClear = resolveGoogleOauthCallbackCookieName(context.request);
	const withClearedGoogleStateCookie = (response: Response): Response => {
		if (cookieNameToClear) {
			response.headers.append(
				'Set-Cookie',
				clearGoogleStateCookie(context.request, cookieNameToClear),
			);
		}
		return response;
	};

	if (!code) {
		return withClearedGoogleStateCookie(
			createStaticHtmlResponse({
				metadata: { title: 'Google Sign-In Error' },
				status: 400,
				body: <OauthAuthorizePage mode="error" error="Missing OAuth code." />,
			}),
		);
	}

	const stateValidation = await validateGoogleCallbackState(context.request);
	if (!stateValidation.valid) {
		// A missing, malformed, expired, or already-used `state` (or its cookie) never checked a
		// credential -- this handler never authenticates a client secret against this server, so
		// there is nothing here analogous to `handleOauthTokenPost`/`handleOauthRevokePost`'s
		// `authenticateOauthClient` 401. Recording it toward the shared network-wide
		// failed-authentication lockout let unrelated protocol noise (a stale tab, a replayed
		// callback, a crawler) from one shared NAT trip a five-minute lockout on
		// `/oauth/token`, `/oauth/revoke`, and `/mcp` for every user behind that address -- while
		// this route itself never even checks `isAuthenticationLockedOut`, so the counter didn't
		// even throttle the thing generating it. `enforceGoogleAuthRateLimit` above already rate
		// limits this endpoint on its own terms.
		return withClearedGoogleStateCookie(
			createStaticHtmlResponse({
				metadata: { title: 'Google Sign-In Error' },
				status: 400,
				body: <OauthAuthorizePage mode="error" error={stateValidation.error} />,
			}),
		);
	}

	try {
		const { accessToken, idToken } = await exchangeGoogleCodeForTokens(
			context.request,
			code,
			stateValidation.codeVerifier,
		);
		const idTokenClaims = await validateGoogleIdToken(idToken, {
			clientId: environment.GOOGLE_CLIENT_ID!,
			expectedNonce: stateValidation.nonce,
		});
		// FEDAUTH-001: the ID token's cryptographically-verified claims are
		// the authoritative identity. The userinfo fetch is still made (bound
		// and validated on its own) so an access token that resolves to a
		// different subject than the one the ID token vouched for is caught
		// here rather than trusted silently.
		const googleProfile = await getGoogleUserProfile(accessToken);
		if (googleProfile.sub !== idTokenClaims.sub) {
			throw new Error('Google access token and ID token identified different subjects.');
		}

		const userId = await upsertGoogleUser({
			subject: idTokenClaims.sub,
			email: idTokenClaims.email,
			name: idTokenClaims.name,
			image: idTokenClaims.picture ?? null,
		});

		const sessionRateLimitResult = await enforceSessionCreationRateLimit({
			networkIdentity: context.networkIdentity,
		});
		if (!sessionRateLimitResult.allowed) {
			return withClearedGoogleStateCookie(
				createRateLimitedResponse(sessionRateLimitResult.retryAfterSeconds),
			);
		}

		const session = await createSession({ userId, request: context.request });
		const response = redirectResponse(stateValidation.callbackPath, 302);
		response.headers.append('Set-Cookie', session.cookieHeaderValue);
		return withClearedGoogleStateCookie(response);
	} catch (error) {
		if (error instanceof Error && error.message === GOOGLE_IDENTITY_CONFLICT_ERROR) {
			return withClearedGoogleStateCookie(
				createStaticHtmlResponse({
					metadata: { title: 'Google Sign-In Error' },
					status: 409,
					body: (
						<OauthAuthorizePage
							mode="error"
							error="This email is already associated with another account. Contact support to link identities."
						/>
					),
				}),
			);
		}

		logger.error({ err: error }, 'Google callback failed');
		return withClearedGoogleStateCookie(
			createStaticHtmlResponse({
				metadata: { title: 'Google Sign-In Error' },
				status: 500,
				body: <OauthAuthorizePage mode="error" error="Google sign-in failed. Please try again." />,
			}),
		);
	}
}

export async function handleSignOut(context: RequestContext): Promise<Response> {
	// No active session: nothing state-changing to protect, and CSRF checks
	// on a no-op sign-out would only reject a legitimate double-click.
	if (!context.sessionToken) {
		const response = redirectResponse('/', 303);
		response.headers.append('Set-Cookie', createExpiredSessionCookie(context.request));
		return response;
	}

	// SEC-005 / S-09: sign-out is a cookie-authenticated, state-changing POST
	// — it needs the same CSRF defenses as OAuth consent, checked before any
	// database work.
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

	let formParameters: URLSearchParams;
	try {
		formParameters = await readBoundedFormUrlEncoded(context.request, signOutMaxBodyBytes);
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

	await revokeSession(context.sessionToken);
	const response = redirectResponse('/', 303);
	response.headers.append('Set-Cookie', createExpiredSessionCookie(context.request));
	return response;
}
