import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@lostgradient/mcp/logger';
import { userProfileResource } from '@lostgradient/mcp';
import { environment } from '@web/env';
import { PayloadTooLargeError, readBoundedFormUrlEncoded } from '@web/lib/bounded-request-body';
import { getBaseUrl } from '@web/lib/base-url';
import { isTrustedRequestOrigin, isValidSessionCsrfToken } from '@web/lib/csrf-protection';
import { isExactContentType } from '@web/lib/exact-content-type';
import { publishUserResourceUpdate } from '@web/lib/mcp-handler';
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
import OauthAuthorizePage from '@web/views/oauth-authorize-page.svelte';

function isGoogleAuthConfigured(): boolean {
	return Boolean(environment.googleClientId && environment.googleClientSecret);
}

function googleAuthNotConfiguredResponse(): Response {
	return createStaticHtmlResponse({
		metadata: { title: 'Google Sign-In Not Configured' },
		status: 503,
		component: OauthAuthorizePage,
		props: {
			mode: 'error',
			error:
				'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or use /auth/dev/login in development.',
		},
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
		// Review finding: this is the one place `users` rows actually change
		// after the profile MCP resource is first published, so it is the
		// single choke point for keeping a `user://profile` subscription
		// honest -- see `publishUserResourceUpdate`'s own doc comment.
		publishUserResourceUpdate(existingGoogleAccount.userId, userProfileResource.uri);
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
	// `oauth-routes.ts`'s OAUTH-003 hit and documented the same constraint),
	// so these two inserts cannot be wrapped in a real transaction. If the
	// second insert fails, best-effort delete the user row this request just
	// created rather than leave an orphaned account no Google identity can
	// ever sign into again — not atomic, but strictly better than a silent
	// orphan.
	//
	// Round-14 review (P2): two concurrent first-time sign-ins for the same
	// never-seen-before Google account both pass the `existingGoogleAccount`
	// and `existingUser` lookups above (neither has committed yet when the
	// other reads), then race this insert on `users.email`'s unique index.
	// The loser used to hit that violation as a bare, uncaught error --
	// outside every `isUniqueConstraintViolation` handler in this function
	// -- and fell through to `handleGoogleSignInCallback`'s generic 500.
	// `.onConflictDoNothing()` makes that race resolve inside Postgres as a
	// single atomic statement instead of a throw: the loser gets back no
	// row rather than an exception, so it can decide what happened next
	// instead of being handed a 500 for a request that, from the user's
	// perspective, just signed in from another tab.
	const userId = randomUUID();
	const [insertedUser] = await database
		.insert(schema.users)
		.values({
			id: userId,
			email: normalizedEmail,
			name: input.name,
			image: input.image,
			emailVerified: true,
			role: 'user',
		})
		.onConflictDoNothing({ target: schema.users.email })
		.returning({ id: schema.users.id });

	if (!insertedUser) {
		// Two, and only two, things can make this email already taken here:
		// a genuinely unrelated pre-existing account already owns it (the
		// same conflict `existingUser` above already rejects outside the
		// race window -- SECURITY: this must stay a conflict. Reconciling on
		// email alone would let any Google account that happens to share an
		// address with an existing user silently attach to it, which is an
		// account-takeover primitive, not a race fix), or the concurrent
		// duplicate request for THIS EXACT, cryptographically-verified
		// subject won the same race and is mid-flight inserting its own
		// `userGoogleAccounts` row below. Only the second is safe to
		// reconcile onto, and the only reliable way to tell them apart is
		// `userGoogleAccounts.googleSubject` (its primary key) actually
		// resolving to a row for THIS subject -- an attacker cannot forge
		// that row into existing; it can only be created by a request that
		// already held a Google-verified ID token for this exact subject.
		// That insert is a second, separate round trip after the winner's
		// `users` insert, so a short bounded retry (capped at 5 attempts,
		// matching this codebase's standing retry-loop cap) gives it the
		// small window it needs to land before this request gives up and
		// reports a genuine conflict instead of a false one.
		for (let attempt = 0; attempt < 5; attempt++) {
			const winner = await findUserIdByGoogleSubject(input.subject);
			if (winner) return winner;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		throw new Error(GOOGLE_IDENTITY_CONFLICT_ERROR);
	}

	try {
		await database.insert(schema.userGoogleAccounts).values({
			googleSubject: input.subject,
			userId,
			email: normalizedEmail,
		});
	} catch (error) {
		if (isUniqueConstraintViolation(error)) {
			// This insert's only unique constraint is the `googleSubject`
			// primary key, so a violation here can only mean one thing: some
			// other request already fully linked this exact, verified
			// subject to a `users` row -- there is no "different identity,
			// same subject" case, Google subjects are unique by
			// construction. Unlike the email-uniqueness race above, that
			// makes this always safe to reconcile: whatever `userId` already
			// owns this subject is, by definition, the account this same
			// Google identity already established. Reconcile onto it rather
			// than manufacturing a conflict for a request that is, from the
			// user's perspective, a legitimate concurrent sign-in.
			const winner = await findUserIdByGoogleSubject(input.subject);

			try {
				await database.delete(schema.users).where(eq(schema.users.id, userId));
			} catch (cleanupError) {
				logger.error(
					{ err: cleanupError, userId },
					'Failed to clean up orphaned user row after a failed Google account insert',
				);
			}

			if (winner) return winner;
			throw new Error(GOOGLE_IDENTITY_CONFLICT_ERROR, { cause: error });
		}

		try {
			await database.delete(schema.users).where(eq(schema.users.id, userId));
		} catch (cleanupError) {
			logger.error(
				{ err: cleanupError, userId },
				'Failed to clean up orphaned user row after a failed Google account insert',
			);
		}
		throw error;
	}

	return userId;
}

async function findUserIdByGoogleSubject(subject: string): Promise<string | null> {
	const [account] = await database
		.select({ userId: schema.userGoogleAccounts.userId })
		.from(schema.userGoogleAccounts)
		.where(eq(schema.userGoogleAccounts.googleSubject, subject))
		.limit(1);
	return account?.userId ?? null;
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
				component: OauthAuthorizePage,
				props: { mode: 'error', error: 'Missing OAuth code.' },
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
				component: OauthAuthorizePage,
				props: { mode: 'error', error: stateValidation.error },
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
			clientId: environment.googleClientId!,
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
					component: OauthAuthorizePage,
					props: {
						mode: 'error',
						error:
							'This email is already associated with another account. Contact support to link identities.',
					},
				}),
			);
		}

		logger.error({ err: error }, 'Google callback failed');
		return withClearedGoogleStateCookie(
			createStaticHtmlResponse({
				metadata: { title: 'Google Sign-In Error' },
				status: 500,
				component: OauthAuthorizePage,
				props: { mode: 'error', error: 'Google sign-in failed. Please try again.' },
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
