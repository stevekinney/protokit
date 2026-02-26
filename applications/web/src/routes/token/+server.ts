import { json } from '@sveltejs/kit';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { database, schema } from '@template/database';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { environment as mcpEnvironment } from '@template/mcp/env';

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get('content-type') || '';

	let body: Record<string, string>;
	if (contentType.includes('application/x-www-form-urlencoded')) {
		const formData = await request.formData();
		body = Object.fromEntries(formData.entries()) as Record<string, string>;
	} else if (contentType.includes('application/json')) {
		body = await request.json();
	} else {
		return json({ error: 'unsupported_content_type' }, { status: 400 });
	}

	const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier } = body;

	if (grant_type !== 'authorization_code') {
		return json({ error: 'unsupported_grant_type' }, { status: 400 });
	}

	if (!code || !redirect_uri || !client_id || !code_verifier) {
		return json(
			{ error: 'invalid_request', error_description: 'Missing required parameters' },
			{ status: 400 },
		);
	}

	// Phase 1: SELECT — fetch the code row without consuming it
	const [authorizationCode] = await database
		.select()
		.from(schema.oauthCodes)
		.where(
			and(
				eq(schema.oauthCodes.code, code),
				eq(schema.oauthCodes.clientId, client_id),
				isNull(schema.oauthCodes.usedAt),
				gt(schema.oauthCodes.expiresAt, new Date()),
			),
		)
		.limit(1);

	if (!authorizationCode) {
		return json(
			{
				error: 'invalid_grant',
				error_description: 'Authorization code not found, already used, or expired',
			},
			{ status: 400 },
		);
	}

	// Phase 2: Validate — check redirect_uri, client_secret, and PKCE before consuming
	if (authorizationCode.redirectUri !== redirect_uri) {
		return json(
			{ error: 'invalid_grant', error_description: 'Redirect URI mismatch' },
			{ status: 400 },
		);
	}

	if (client_secret) {
		const [client] = await database
			.select()
			.from(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, client_id))
			.limit(1);

		if (!client) {
			return json({ error: 'invalid_client' }, { status: 401 });
		}

		const expected = Buffer.from(client.clientSecret, 'utf-8');
		const received = Buffer.from(client_secret, 'utf-8');
		if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
			return json({ error: 'invalid_client' }, { status: 401 });
		}
	}

	const challenge = createHash('sha256').update(code_verifier).digest('base64url');

	if (challenge !== authorizationCode.codeChallenge) {
		return json(
			{ error: 'invalid_grant', error_description: 'PKCE verification failed' },
			{ status: 400 },
		);
	}

	// Phase 3: Atomic UPDATE — consume the code; usedAt IS NULL guard handles races
	const [consumedCode] = await database
		.update(schema.oauthCodes)
		.set({ usedAt: new Date() })
		.where(and(eq(schema.oauthCodes.code, code), isNull(schema.oauthCodes.usedAt)))
		.returning();

	if (!consumedCode) {
		return json(
			{
				error: 'invalid_grant',
				error_description: 'Authorization code already used',
			},
			{ status: 400 },
		);
	}

	// Issue access token
	const accessToken = randomBytes(48).toString('hex');
	const tokenTtlSeconds = mcpEnvironment.MCP_TOKEN_TTL_SECONDS;
	const expiresAt = new Date(Date.now() + tokenTtlSeconds * 1000);

	await database.insert(schema.oauthTokens).values({
		accessToken,
		clientId: authorizationCode.clientId,
		userId: authorizationCode.userId,
		scope: authorizationCode.scope || '',
		expiresAt,
	});

	return json(
		{
			access_token: accessToken,
			token_type: 'bearer',
			expires_in: tokenTtlSeconds,
			scope: authorizationCode.scope || '',
		},
		{
			headers: {
				'Cache-Control': 'no-store',
			},
		},
	);
};
