import { json } from '@sveltejs/kit';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { database, schema } from '@template/database';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { environment as mcpEnvironment } from '@template/mcp/env';
import { hashCredential } from '$lib/hash-credential';
import { corsHeaders, handleCorsPreflight } from '$lib/cors';
import { enforceTokenRateLimit } from '$lib/request-rate-limiter';
import { createRateLimitedResponse } from '$lib/rate-limit-response';
import { environment } from '../../env.js';
import { evaluateEnterpriseAuthorizationPolicy } from '$lib/enterprise-authorization-policy';

export const OPTIONS = handleCorsPreflight;

const tokenResponseHeaders = {
	'Cache-Control': 'no-store',
	Pragma: 'no-cache',
	...corsHeaders,
};

function constantTimeEquals(a: string, b: string): boolean {
	const bufferA = Buffer.from(a, 'utf-8');
	const bufferB = Buffer.from(b, 'utf-8');
	if (bufferA.length !== bufferB.length) return false;
	return timingSafeEqual(bufferA, bufferB);
}

function issueTokens() {
	const accessToken = randomBytes(48).toString('hex');
	const refreshToken = randomBytes(48).toString('hex');
	const tokenTtlSeconds = mcpEnvironment.MCP_TOKEN_TTL_SECONDS;
	const refreshTtlSeconds = mcpEnvironment.MCP_REFRESH_TOKEN_TTL_SECONDS;

	return {
		accessToken,
		accessTokenHash: hashCredential(accessToken),
		refreshToken,
		refreshTokenHash: hashCredential(refreshToken),
		tokenTtlSeconds,
		accessTokenExpiresAt: new Date(Date.now() + tokenTtlSeconds * 1000),
		refreshTokenExpiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
	};
}

async function handleAuthorizationCodeGrant(body: Record<string, string>) {
	const { code, redirect_uri, client_id, client_secret, code_verifier } = body;

	if (!code || !redirect_uri || !client_id || !code_verifier) {
		return json(
			{ error: 'invalid_request', error_description: 'Missing required parameters' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const [client] = await database
		.select()
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientId, client_id))
		.limit(1);

	if (!client) {
		return json({ error: 'invalid_client' }, { status: 401, headers: tokenResponseHeaders });
	}

	if (!client.grantTypes.includes('authorization_code')) {
		return json(
			{
				error: 'unauthorized_client',
				error_description: 'Client is not authorized for authorization_code.',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (client.tokenEndpointAuthMethod === 'client_secret_post') {
		if (!client_secret) {
			return json({ error: 'invalid_client' }, { status: 401, headers: tokenResponseHeaders });
		}

		if (!constantTimeEquals(client.clientSecret, hashCredential(client_secret))) {
			return json({ error: 'invalid_client' }, { status: 401, headers: tokenResponseHeaders });
		}
	}

	if (client.tokenEndpointAuthMethod === 'none' && client_secret) {
		return json({ error: 'invalid_client' }, { status: 401, headers: tokenResponseHeaders });
	}

	// Phase 1: SELECT — fetch the code row without consuming it
	const codeHash = hashCredential(code);

	const [authorizationCode] = await database
		.select()
		.from(schema.oauthCodes)
		.where(
			and(
				eq(schema.oauthCodes.code, codeHash),
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
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	// Phase 2: Validate — check redirect_uri, client_secret, and PKCE before consuming
	if (authorizationCode.redirectUri !== redirect_uri) {
		return json(
			{ error: 'invalid_grant', error_description: 'Redirect URI mismatch' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const challenge = createHash('sha256').update(code_verifier).digest('base64url');

	if (!constantTimeEquals(challenge, authorizationCode.codeChallenge)) {
		return json(
			{ error: 'invalid_grant', error_description: 'PKCE verification failed' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	// Phase 3: Atomic UPDATE — consume the code; usedAt IS NULL guard handles races
	const [consumedCode] = await database
		.update(schema.oauthCodes)
		.set({ usedAt: new Date() })
		.where(and(eq(schema.oauthCodes.code, codeHash), isNull(schema.oauthCodes.usedAt)))
		.returning();

	if (!consumedCode) {
		return json(
			{
				error: 'invalid_grant',
				error_description: 'Authorization code already used',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const enterpriseDecision = await evaluateEnterpriseAuthorizationPolicy({
		clientId: authorizationCode.clientId,
		userId: authorizationCode.userId,
		action: 'issue_token',
	});
	if (!enterpriseDecision.allowed) {
		return json(
			{
				error: 'access_denied',
				error_description: `Enterprise authorization policy denied token issuance: ${enterpriseDecision.reason}`,
			},
			{ status: 403, headers: tokenResponseHeaders },
		);
	}

	// Issue access token + refresh token
	const tokens = issueTokens();

	await database.insert(schema.oauthTokens).values({
		accessToken: tokens.accessTokenHash,
		clientId: authorizationCode.clientId,
		userId: authorizationCode.userId,
		scope: authorizationCode.scope || '',
		expiresAt: tokens.accessTokenExpiresAt,
	});

	await database.insert(schema.oauthRefreshTokens).values({
		refreshToken: tokens.refreshTokenHash,
		clientId: authorizationCode.clientId,
		userId: authorizationCode.userId,
		scope: authorizationCode.scope || '',
		accessTokenHash: tokens.accessTokenHash,
		expiresAt: tokens.refreshTokenExpiresAt,
	});

	return json(
		{
			access_token: tokens.accessToken,
			token_type: 'Bearer',
			expires_in: tokens.tokenTtlSeconds,
			refresh_token: tokens.refreshToken,
			scope: authorizationCode.scope || '',
		},
		{ headers: tokenResponseHeaders },
	);
}

async function handleRefreshTokenGrant(body: Record<string, string>) {
	const { refresh_token, client_id, client_secret } = body;

	if (!refresh_token) {
		return json(
			{ error: 'invalid_request', error_description: 'Missing refresh_token parameter' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (!client_id) {
		return json(
			{ error: 'invalid_request', error_description: 'Missing client_id parameter' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const [client] = await database
		.select()
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientId, client_id))
		.limit(1);

	if (!client) {
		return json({ error: 'invalid_client' }, { status: 401, headers: tokenResponseHeaders });
	}

	if (!client.grantTypes.includes('refresh_token')) {
		return json(
			{
				error: 'unauthorized_client',
				error_description: 'Client is not authorized for refresh_token.',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (client.tokenEndpointAuthMethod === 'client_secret_post') {
		if (!client_secret) {
			return json({ error: 'invalid_client' }, { status: 401, headers: tokenResponseHeaders });
		}
		if (!constantTimeEquals(client.clientSecret, hashCredential(client_secret))) {
			return json({ error: 'invalid_client' }, { status: 401, headers: tokenResponseHeaders });
		}
	}

	const refreshTokenHash = hashCredential(refresh_token);

	// Atomic revocation: UPDATE SET revokedAt WHERE revokedAt IS NULL prevents race conditions
	const [revokedToken] = await database
		.update(schema.oauthRefreshTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(schema.oauthRefreshTokens.refreshToken, refreshTokenHash),
				isNull(schema.oauthRefreshTokens.revokedAt),
				gt(schema.oauthRefreshTokens.expiresAt, new Date()),
			),
		)
		.returning();

	if (!revokedToken) {
		return json(
			{
				error: 'invalid_grant',
				error_description: 'Refresh token not found, already used, or expired',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	// Validate client_id matches
	if (revokedToken.clientId !== client_id) {
		return json(
			{ error: 'invalid_grant', error_description: 'Client ID mismatch' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	// Revoke the old access token (defense in depth)
	await database
		.update(schema.oauthTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(schema.oauthTokens.accessToken, revokedToken.accessTokenHash),
				isNull(schema.oauthTokens.revokedAt),
			),
		);

	const enterpriseDecision = await evaluateEnterpriseAuthorizationPolicy({
		clientId: revokedToken.clientId,
		userId: revokedToken.userId,
		action: 'issue_token',
	});
	if (!enterpriseDecision.allowed) {
		return json(
			{
				error: 'access_denied',
				error_description: `Enterprise authorization policy denied token issuance: ${enterpriseDecision.reason}`,
			},
			{ status: 403, headers: tokenResponseHeaders },
		);
	}

	// Issue new access token + new refresh token (rotation)
	const tokens = issueTokens();

	await database.insert(schema.oauthTokens).values({
		accessToken: tokens.accessTokenHash,
		clientId: revokedToken.clientId,
		userId: revokedToken.userId,
		scope: revokedToken.scope || '',
		expiresAt: tokens.accessTokenExpiresAt,
	});

	await database.insert(schema.oauthRefreshTokens).values({
		refreshToken: tokens.refreshTokenHash,
		clientId: revokedToken.clientId,
		userId: revokedToken.userId,
		scope: revokedToken.scope || '',
		accessTokenHash: tokens.accessTokenHash,
		expiresAt: tokens.refreshTokenExpiresAt,
	});

	return json(
		{
			access_token: tokens.accessToken,
			token_type: 'Bearer',
			expires_in: tokens.tokenTtlSeconds,
			refresh_token: tokens.refreshToken,
			scope: revokedToken.scope || '',
		},
		{ headers: tokenResponseHeaders },
	);
}

async function handleClientCredentialsGrant(body: Record<string, string>) {
	if (!environment.MCP_ENABLE_CLIENT_CREDENTIALS) {
		return json(
			{
				error: 'unsupported_grant_type',
				error_description: 'client_credentials is disabled on this server',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const { client_id, client_secret, scope } = body;

	if (!client_id || !client_secret) {
		return json(
			{
				error: 'invalid_request',
				error_description: 'Missing client_id or client_secret parameter',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const [client] = await database
		.select()
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientId, client_id))
		.limit(1);

	if (!client) {
		return json({ error: 'invalid_client' }, { status: 401, headers: tokenResponseHeaders });
	}

	if (!constantTimeEquals(client.clientSecret, hashCredential(client_secret))) {
		return json({ error: 'invalid_client' }, { status: 401, headers: tokenResponseHeaders });
	}

	if (!client.grantTypes.includes('client_credentials')) {
		return json(
			{
				error: 'unauthorized_client',
				error_description: 'Client is not authorized for client_credentials.',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (!client.serviceAccountUserId) {
		return json(
			{
				error: 'invalid_client',
				error_description: 'Client is missing a service account identity.',
			},
			{ status: 401, headers: tokenResponseHeaders },
		);
	}

	const enterpriseDecision = await evaluateEnterpriseAuthorizationPolicy({
		clientId: client.clientId,
		userId: client.serviceAccountUserId,
		action: 'issue_token',
	});
	if (!enterpriseDecision.allowed) {
		return json(
			{
				error: 'access_denied',
				error_description: `Enterprise authorization policy denied token issuance: ${enterpriseDecision.reason}`,
			},
			{ status: 403, headers: tokenResponseHeaders },
		);
	}

	const tokens = issueTokens();
	await database.insert(schema.oauthTokens).values({
		accessToken: tokens.accessTokenHash,
		clientId: client.clientId,
		userId: client.serviceAccountUserId,
		scope: scope ?? '',
		expiresAt: tokens.accessTokenExpiresAt,
	});

	return json(
		{
			access_token: tokens.accessToken,
			token_type: 'Bearer',
			expires_in: tokens.tokenTtlSeconds,
			scope: scope ?? '',
		},
		{ headers: tokenResponseHeaders },
	);
}

export const POST: RequestHandler = async (event) => {
	const { request } = event;
	const contentType = request.headers.get('content-type') || '';

	let body: Record<string, string>;
	if (contentType.includes('application/x-www-form-urlencoded')) {
		const formData = await request.formData();
		body = Object.fromEntries(formData.entries()) as Record<string, string>;
	} else if (contentType.includes('application/json')) {
		body = await request.json();
	} else {
		return json(
			{ error: 'unsupported_content_type' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const rateLimitResult = await enforceTokenRateLimit(event, body.client_id);
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds, tokenResponseHeaders);
	}

	const { grant_type } = body;

	if (grant_type === 'authorization_code') {
		return handleAuthorizationCodeGrant(body);
	}

	if (grant_type === 'refresh_token') {
		return handleRefreshTokenGrant(body);
	}

	if (grant_type === 'client_credentials') {
		return handleClientCredentialsGrant(body);
	}

	return json({ error: 'unsupported_grant_type' }, { status: 400, headers: tokenResponseHeaders });
};
