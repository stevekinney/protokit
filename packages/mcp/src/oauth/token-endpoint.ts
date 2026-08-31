import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { authenticateOauthClient } from './client-authentication.js';
import { oauthBodyError, oauthJson } from './endpoint-responses.js';
import {
	isAuthenticationLockedOut,
	rateLimitResponse,
	recordFailedAuthentication,
} from './endpoint-rate-limits.js';
import type { OAuthRequestContext, OAuthStatelessHostSeams } from './index.js';
import { isValidPkceCodeVerifier } from './pkce-validation.js';
import { oauthTokenMaximumBodyBytes, readOauthParameters } from './request-body.js';
import { constantTimeEquals } from './security-utilities.js';
import { parseRefreshScope } from './scope-utilities.js';

const maximumTokenLength = 512;
const maximumUrlLength = 2048;

function issueCredentials<Scope extends string>(seams: OAuthStatelessHostSeams<Scope>, now: Date) {
	const accessToken = randomBytes(48).toString('hex');
	const refreshToken = randomBytes(48).toString('hex');
	return {
		accessToken,
		refreshToken,
		accessTokenHash: seams.hashCredential(accessToken),
		refreshTokenHash: seams.hashCredential(refreshToken),
		accessTokenExpiresAt: new Date(
			now.getTime() + seams.configuration.accessTokenTtlSeconds * 1000,
		),
		refreshTokenExpiresAt: new Date(
			now.getTime() + seams.configuration.refreshTokenTtlSeconds * 1000,
		),
	};
}

async function authorizationCodeGrant<Scope extends string>(
	body: Record<string, string>,
	seams: OAuthStatelessHostSeams<Scope>,
): Promise<Response> {
	const {
		code,
		redirect_uri: redirectUri,
		client_id: clientId,
		client_secret: clientSecret,
		code_verifier: verifier,
		resource,
	} = body;
	if (!code || !redirectUri || !clientId || !verifier || !resource)
		return oauthJson(
			{ error: 'invalid_request', error_description: 'Missing required parameters' },
			400,
		);
	if (
		code.length > maximumTokenLength ||
		redirectUri.length > maximumUrlLength ||
		clientId.length > maximumUrlLength ||
		resource.length > maximumUrlLength
	)
		return oauthJson(
			{ error: 'invalid_request', error_description: 'A parameter exceeded its maximum length' },
			400,
		);
	if (resource !== seams.configuration.resource.href) {
		seams.recordEvent?.({
			category: 'token_exchange',
			outcome: 'invalid_resource',
			attributes: { grantType: 'authorization_code' },
		});
		return oauthJson(
			{
				error: 'invalid_target',
				error_description: 'resource does not match this server resource URL',
			},
			400,
		);
	}
	if (!isValidPkceCodeVerifier(verifier))
		return oauthJson({ error: 'invalid_grant', error_description: 'Malformed code_verifier' }, 400);
	const authentication = await authenticateOauthClient(clientId, clientSecret, seams);
	if (!authentication.ok) {
		seams.recordEvent?.({
			category: 'client_authentication',
			outcome: 'invalid_client',
			attributes: { clientId },
		});
		return oauthJson({ error: 'invalid_client' }, 401);
	}
	if (!authentication.client.grantTypes.includes('authorization_code'))
		return oauthJson({ error: 'unauthorized_client' }, 400);

	const codeHash = seams.hashCredential(code);
	const authorizationCode = await seams.stores.codes.findByHash(codeHash);
	const now = new Date();
	if (
		!authorizationCode ||
		authorizationCode.clientId !== clientId ||
		authorizationCode.usedAt ||
		authorizationCode.expiresAt <= now
	)
		return oauthJson(
			{
				error: 'invalid_grant',
				error_description: 'Authorization code not found, already used, or expired',
			},
			400,
		);
	if (authorizationCode.redirectUri !== redirectUri)
		return oauthJson({ error: 'invalid_grant', error_description: 'Redirect URI mismatch' }, 400);
	if (authorizationCode.resource !== resource)
		return oauthJson(
			{
				error: 'invalid_target',
				error_description: 'resource does not match the authorization code',
			},
			400,
		);
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	if (!constantTimeEquals(challenge, authorizationCode.codeChallenge))
		return oauthJson(
			{ error: 'invalid_grant', error_description: 'PKCE verification failed' },
			400,
		);

	const consumedCode = await seams.stores.codes.consume(codeHash, now);
	if (!consumedCode)
		return oauthJson(
			{ error: 'invalid_grant', error_description: 'Authorization code already used' },
			400,
		);
	const credentials = issueCredentials(seams, now);
	const issueRefreshToken = authentication.client.grantTypes.includes('refresh_token');
	try {
		await seams.stores.tokens.issueAuthorizationGrant({
			accessToken: {
				accessTokenHash: credentials.accessTokenHash,
				clientId,
				userId: consumedCode.userId,
				scope: consumedCode.scope ?? '',
				resource,
				expiresAt: credentials.accessTokenExpiresAt,
				revokedAt: null,
				createdAt: now,
			},
			...(issueRefreshToken
				? {
						refreshToken: {
							refreshTokenHash: credentials.refreshTokenHash,
							clientId,
							userId: consumedCode.userId,
							scope: consumedCode.scope ?? '',
							resource,
							accessTokenHash: credentials.accessTokenHash,
							familyId: randomUUID(),
							expiresAt: credentials.refreshTokenExpiresAt,
							revokedAt: null,
							createdAt: now,
						},
					}
				: {}),
		});
	} catch (error) {
		await seams.stores.codes.unconsume(codeHash, consumedCode.usedAt).catch(() => false);
		throw error;
	}
	seams.recordEvent?.({ category: 'token_exchange', outcome: 'success' });
	return oauthJson({
		access_token: credentials.accessToken,
		token_type: 'Bearer',
		expires_in: seams.configuration.accessTokenTtlSeconds,
		...(issueRefreshToken ? { refresh_token: credentials.refreshToken } : {}),
		scope: consumedCode.scope ?? '',
	});
}

async function refreshTokenGrant<Scope extends string>(
	body: Record<string, string>,
	seams: OAuthStatelessHostSeams<Scope>,
): Promise<Response> {
	const {
		refresh_token: refreshToken,
		client_id: clientId,
		client_secret: clientSecret,
		resource,
		scope,
	} = body;
	if (!refreshToken || !clientId || !resource)
		return oauthJson(
			{ error: 'invalid_request', error_description: 'Missing required parameters' },
			400,
		);
	if (
		refreshToken.length > maximumTokenLength ||
		clientId.length > maximumUrlLength ||
		resource.length > maximumUrlLength ||
		(scope?.length ?? 0) > 512
	)
		return oauthJson(
			{ error: 'invalid_request', error_description: 'A parameter exceeded its maximum length' },
			400,
		);
	if (resource !== seams.configuration.resource.href) {
		seams.recordEvent?.({
			category: 'refresh',
			outcome: 'invalid_resource',
			attributes: { grantType: 'refresh_token' },
		});
		return oauthJson(
			{
				error: 'invalid_target',
				error_description: 'resource does not match this server resource URL',
			},
			400,
		);
	}
	const parsedScope = parseRefreshScope(scope, seams.scopes.supportedScopes);
	if (!parsedScope.ok) return oauthJson({ error: 'invalid_scope' }, 400);
	const authentication = await authenticateOauthClient(clientId, clientSecret, seams);
	if (!authentication.ok) {
		seams.recordEvent?.({
			category: 'client_authentication',
			outcome: 'invalid_client',
			attributes: { clientId },
		});
		return oauthJson({ error: 'invalid_client' }, 401);
	}
	if (!authentication.client.grantTypes.includes('refresh_token'))
		return oauthJson({ error: 'unauthorized_client' }, 400);
	const now = new Date();
	const credentials = issueCredentials(seams, now);
	const rotation = await seams.stores.tokens.rotateRefreshToken({
		priorHash: seams.hashCredential(refreshToken),
		clientId,
		resource,
		...(parsedScope.requestedScope !== undefined
			? { requestedScope: parsedScope.requestedScope }
			: {}),
		nextAccessTokenHash: credentials.accessTokenHash,
		nextRefreshTokenHash: credentials.refreshTokenHash,
		accessTokenExpiresAt: credentials.accessTokenExpiresAt,
		refreshTokenExpiresAt: credentials.refreshTokenExpiresAt,
		createdAt: now,
	});
	if (rotation.status === 'replay_revoked') {
		seams.recordEvent?.({
			category: 'refresh',
			outcome: 'replay_detected',
			attributes: { clientId },
		});
		await seams.publishGrantRevocation?.(rotation.userId);
		return oauthJson(
			{
				error: 'invalid_grant',
				error_description: 'Refresh token not found, already used, or expired',
			},
			400,
		);
	}
	if (rotation.status === 'scope_rejected')
		return oauthJson(
			{ error: 'invalid_scope', error_description: 'Requested scope exceeds the original grant' },
			400,
		);
	if (rotation.status === 'invalid')
		return oauthJson(
			{
				error: 'invalid_grant',
				error_description: 'Refresh token not found, already used, or expired',
			},
			400,
		);
	seams.recordEvent?.({ category: 'refresh', outcome: 'success' });
	return oauthJson({
		access_token: credentials.accessToken,
		token_type: 'Bearer',
		expires_in: seams.configuration.accessTokenTtlSeconds,
		refresh_token: credentials.refreshToken,
		scope: rotation.accessToken.scope ?? '',
	});
}

export async function handleOauthTokenPost<Scope extends string>(
	context: OAuthRequestContext,
	seams: OAuthStatelessHostSeams<Scope>,
): Promise<Response> {
	if (await isAuthenticationLockedOut(context, seams))
		return oauthJson(
			{ error: 'invalid_client', error_description: 'Too many failed authentication attempts.' },
			429,
		);
	const networkLimit = await rateLimitResponse({ context, seams, category: 'oauth_token_network' });
	if (networkLimit) return networkLimit;
	let body: Record<string, string>;
	try {
		body = await readOauthParameters(context.request, oauthTokenMaximumBodyBytes);
	} catch (error) {
		return oauthBodyError(error);
	}
	if (body.client_id) {
		const clientLimit = await rateLimitResponse({
			context,
			seams,
			category: 'oauth_token_client',
			identifier: body.client_id,
		});
		if (clientLimit) return clientLimit;
	}
	let response: Response;
	if (body.grant_type === 'authorization_code')
		response = await authorizationCodeGrant(body, seams);
	else if (body.grant_type === 'refresh_token') response = await refreshTokenGrant(body, seams);
	else response = oauthJson({ error: 'unsupported_grant_type' }, 400);
	if (response.status === 401) await recordFailedAuthentication(context, seams);
	return response;
}
