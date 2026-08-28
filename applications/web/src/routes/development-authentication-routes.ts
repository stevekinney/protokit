import { randomUUID } from 'node:crypto';
import { database, schema } from '@template/database';
import { logger } from '@lostgradient/mcp/logger';
import { environment } from '@web/env';
import { jsonResponse, redirectResponse } from '@web/lib/http-response';
import { createRateLimitedResponse } from '@web/lib/rate-limit-response';
import type { RequestContext } from '@web/lib/request-context';
import { enforceSessionCreationRateLimit } from '@web/lib/request-rate-limiter';
import { createSession } from '@web/lib/session-authentication';

const DEVELOPMENT_USER_EMAIL = 'dev@localhost';
const DEVELOPMENT_USER_NAME = 'Development User';

export async function handleDevelopmentLogin(context: RequestContext): Promise<Response> {
	if (environment.nodeEnv !== 'development') {
		return jsonResponse({ error: 'not_found' }, { status: 404 });
	}

	// CONFIG-001 (S-06): `scripts/develop.ts --tunnel` sets this before it
	// opens a public cloudflared tunnel in front of the dev server. A tunnel
	// makes every route — including this one — reachable from the public
	// internet even though NODE_ENV stays 'development', so the login bypass
	// must refuse regardless of NODE_ENV whenever a tunnel is active.
	if (environment.protokitTunnelActive) {
		return jsonResponse({ error: 'not_found' }, { status: 404 });
	}

	const rateLimitResult = await enforceSessionCreationRateLimit({
		networkIdentity: context.networkIdentity,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds);
	}

	try {
		const { eq } = await import('drizzle-orm');
		const [existingUser] = await database
			.select({ id: schema.users.id })
			.from(schema.users)
			.where(eq(schema.users.email, DEVELOPMENT_USER_EMAIL))
			.limit(1);

		let userId: string;

		if (existingUser) {
			userId = existingUser.id;
		} else {
			userId = randomUUID();
			await database.insert(schema.users).values({
				id: userId,
				email: DEVELOPMENT_USER_EMAIL,
				name: DEVELOPMENT_USER_NAME,
				emailVerified: true,
				role: 'user',
			});
			logger.info({ userId }, 'Created development user');
		}

		const session = await createSession({ userId, request: context.request });
		const response = redirectResponse('/', 302);
		response.headers.append('Set-Cookie', session.cookieHeaderValue);
		return response;
	} catch (error) {
		logger.error({ err: error }, 'Development login failed');
		return jsonResponse(
			{ error: 'internal_error', error_description: 'Development login failed' },
			{ status: 500 },
		);
	}
}
