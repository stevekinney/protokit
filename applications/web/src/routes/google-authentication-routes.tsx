import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@template/mcp/logger';
import {
	clearGoogleStateCookie,
	createGoogleSignInRedirectResponse,
	exchangeGoogleCodeForAccessToken,
	getGoogleUserProfile,
	validateGoogleCallbackState,
} from '@web/lib/google-authentication';
import { createHtmlResponse } from '@web/lib/html-response';
import { redirectResponse } from '@web/lib/http-response';
import type { RequestContext } from '@web/lib/request-context';
import {
	createExpiredSessionCookie,
	createSession,
	revokeSession,
} from '@web/lib/session-authentication';
import { OauthAuthorizePage } from '@web/views/oauth-authorize-page';

const GOOGLE_IDENTITY_CONFLICT_ERROR = 'google_identity_conflict';

async function upsertGoogleUser(input: {
	subject: string;
	email: string;
	name: string;
	image: string | null;
}): Promise<string> {
	const [existingGoogleAccount] = await database
		.select({ userId: schema.userGoogleAccounts.userId })
		.from(schema.userGoogleAccounts)
		.where(eq(schema.userGoogleAccounts.googleSubject, input.subject))
		.limit(1);

	if (existingGoogleAccount) {
		await database
			.update(schema.users)
			.set({
				email: input.email,
				name: input.name,
				image: input.image,
				emailVerified: true,
				updatedAt: new Date(),
			})
			.where(eq(schema.users.id, existingGoogleAccount.userId));
		await database
			.update(schema.userGoogleAccounts)
			.set({
				email: input.email,
				updatedAt: new Date(),
			})
			.where(eq(schema.userGoogleAccounts.googleSubject, input.subject));
		return existingGoogleAccount.userId;
	}

	const [existingUser] = await database
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.email, input.email))
		.limit(1);
	if (existingUser) {
		throw new Error(GOOGLE_IDENTITY_CONFLICT_ERROR);
	}

	const userId = randomUUID();
	await database.insert(schema.users).values({
		id: userId,
		email: input.email,
		name: input.name,
		image: input.image,
		emailVerified: true,
		role: 'user',
	});

	await database.insert(schema.userGoogleAccounts).values({
		googleSubject: input.subject,
		userId,
		email: input.email,
	});

	return userId;
}

export async function handleGoogleSignInStart(context: RequestContext): Promise<Response> {
	void context;
	return createGoogleSignInRedirectResponse(context.request);
}

export async function handleGoogleSignInCallback(context: RequestContext): Promise<Response> {
	const requestUrl = context.requestUrl;
	const code = requestUrl.searchParams.get('code');
	if (!code) {
		return createHtmlResponse({
			title: 'Google Sign-In Error',
			status: 400,
			body: <OauthAuthorizePage mode="error" error="Missing OAuth code." />,
		});
	}

	const stateValidation = validateGoogleCallbackState(context.request);
	if (!stateValidation.valid) {
		return createHtmlResponse({
			title: 'Google Sign-In Error',
			status: 400,
			body: <OauthAuthorizePage mode="error" error={stateValidation.error} />,
		});
	}

	try {
		const accessToken = await exchangeGoogleCodeForAccessToken(context.request, code);
		const googleProfile = await getGoogleUserProfile(accessToken);
		const userId = await upsertGoogleUser({
			subject: googleProfile.sub,
			email: googleProfile.email,
			name: googleProfile.name,
			image: googleProfile.picture ?? null,
		});

		const session = await createSession({ userId, request: context.request });
		const response = redirectResponse(stateValidation.callbackPath, 302);
		response.headers.append('Set-Cookie', session.cookieHeaderValue);
		response.headers.append('Set-Cookie', clearGoogleStateCookie(context.request));
		return response;
	} catch (error) {
		if (error instanceof Error && error.message === GOOGLE_IDENTITY_CONFLICT_ERROR) {
			return createHtmlResponse({
				title: 'Google Sign-In Error',
				status: 409,
				body: (
					<OauthAuthorizePage
						mode="error"
						error="This email is already associated with another account. Contact support to link identities."
					/>
				),
			});
		}

		logger.error({ err: error }, 'Google callback failed');
		return createHtmlResponse({
			title: 'Google Sign-In Error',
			status: 500,
			body: <OauthAuthorizePage mode="error" error="Google sign-in failed. Please try again." />,
		});
	}
}

export async function handleSignOut(context: RequestContext): Promise<Response> {
	await revokeSession(context.sessionToken);
	const response = redirectResponse('/', 303);
	response.headers.append('Set-Cookie', createExpiredSessionCookie(context.request));
	return response;
}
