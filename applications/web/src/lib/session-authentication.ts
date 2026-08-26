import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { environment } from '@web/env';
import { parseCookies, serializeCookie } from '@web/lib/cookies';
import { hashCredential } from '@web/lib/hash-credential';
import type { ApplicationUser } from '@web/types/user';

const SESSION_TIME_TO_LIVE_SECONDS = environment.sessionTimeToLiveSeconds;

export type { ApplicationUser };

export type SessionHydrationResult = {
	user: ApplicationUser | null;
	sessionToken: string | null;
};

/**
 * SEC-005 / S-17: in production the session cookie carries the `__Host-`
 * prefix. A browser will only accept a `__Host-`-prefixed `Set-Cookie` when
 * it also sets `Secure`, `Path=/`, and omits `Domain` — which
 * `getSecureCookieFlag`/`serializeCookie` below already guarantee in
 * production — so this name change turns those three attributes from a
 * convention this code happens to follow into one the browser itself
 * enforces; a future edit that accidentally adds `Domain=` or drops
 * `Secure` in production would make the cookie silently rejected rather
 * than silently weakened. Development/test keep the unprefixed name so a
 * plain-HTTP `localhost` origin (`Secure` cookies are dropped there) still
 * works.
 */
function getSessionCookieName(): string {
	if (environment.nodeEnv === 'production') {
		return `__Host-${environment.sessionCookieName}`;
	}

	return environment.sessionCookieName;
}

function getSecureCookieFlag(url: URL): boolean {
	if (environment.nodeEnv === 'production') {
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
		name: getSessionCookieName(),
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
	const sessionToken = cookies.get(getSessionCookieName()) ?? null;
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
		name: getSessionCookieName(),
		value: '',
		maxAgeSeconds: 0,
		httpOnly: true,
		secure: getSecureCookieFlag(new URL(request.url)),
		sameSite: 'Lax',
		path: '/',
	});
}
