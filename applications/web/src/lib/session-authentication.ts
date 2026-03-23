import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { environment } from '@web/env';
import { parseCookies, serializeCookie } from '@web/lib/cookies';
import { hashCredential } from '@web/lib/hash-credential';
import type { ApplicationUser } from '@web/types/user';

const SESSION_COOKIE_NAME = environment.SESSION_COOKIE_NAME;
const SESSION_TIME_TO_LIVE_SECONDS = environment.SESSION_TIME_TO_LIVE_SECONDS;

export type { ApplicationUser };

export type SessionHydrationResult = {
	user: ApplicationUser | null;
	sessionToken: string | null;
};

function getSecureCookieFlag(url: URL): boolean {
	if (environment.NODE_ENV === 'production') {
		return true;
	}

	return url.protocol === 'https:';
}

export async function createSession(input: {
	userId: string;
	request: Request;
}): Promise<{ cookieHeaderValue: string; sessionToken: string }> {
	const sessionToken = randomBytes(48).toString('hex');
	const sessionTokenHash = hashCredential(sessionToken);
	const expiresAt = new Date(Date.now() + SESSION_TIME_TO_LIVE_SECONDS * 1000);

	await database.insert(schema.userSessions).values({
		sessionTokenHash,
		userId: input.userId,
		expiresAt,
		ipAddress: null,
		userAgent: input.request.headers.get('user-agent'),
	});

	const cookieHeaderValue = serializeCookie({
		name: SESSION_COOKIE_NAME,
		value: sessionToken,
		maxAgeSeconds: SESSION_TIME_TO_LIVE_SECONDS,
		httpOnly: true,
		secure: getSecureCookieFlag(new URL(input.request.url)),
		sameSite: 'Lax',
		path: '/',
	});

	return { cookieHeaderValue, sessionToken };
}

export async function revokeSession(sessionToken: string | null): Promise<void> {
	if (!sessionToken) {
		return;
	}

	const sessionTokenHash = hashCredential(sessionToken);
	await database
		.update(schema.userSessions)
		.set({ revokedAt: new Date(), updatedAt: new Date() })
		.where(
			and(
				eq(schema.userSessions.sessionTokenHash, sessionTokenHash),
				isNull(schema.userSessions.revokedAt),
			),
		);
}

export async function hydrateSession(request: Request): Promise<SessionHydrationResult> {
	const cookies = parseCookies(request.headers.get('cookie'));
	const sessionToken = cookies.get(SESSION_COOKIE_NAME) ?? null;
	if (!sessionToken) {
		return { user: null, sessionToken: null };
	}

	const sessionTokenHash = hashCredential(sessionToken);
	const [record] = await database
		.select({
			id: schema.users.id,
			email: schema.users.email,
			name: schema.users.name,
			image: schema.users.image,
			role: schema.users.role,
		})
		.from(schema.userSessions)
		.innerJoin(schema.users, eq(schema.userSessions.userId, schema.users.id))
		.where(
			and(
				eq(schema.userSessions.sessionTokenHash, sessionTokenHash),
				isNull(schema.userSessions.revokedAt),
				gt(schema.userSessions.expiresAt, new Date()),
			),
		)
		.limit(1);

	if (!record) {
		return { user: null, sessionToken: null };
	}

	return {
		user: {
			id: record.id,
			email: record.email,
			name: record.name,
			image: record.image,
			role: record.role,
		},
		sessionToken,
	};
}

export function createExpiredSessionCookie(request: Request): string {
	return serializeCookie({
		name: SESSION_COOKIE_NAME,
		value: '',
		maxAgeSeconds: 0,
		httpOnly: true,
		secure: getSecureCookieFlag(new URL(request.url)),
		sameSite: 'Lax',
		path: '/',
	});
}
