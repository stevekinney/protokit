import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { database, schema } from '@template/database';
import { environment } from '@web/env';
import { getBaseUrl } from '@web/lib/base-url';
import { oauthCorsHeaders } from '@web/lib/cors';
import { constantTimeEquals } from '@web/lib/constant-time-equals';
import { hashCredential } from '@web/lib/hash-credential';
import { createStaticHtmlResponse } from '@web/lib/html-response';
import { jsonResponse, redirectResponse } from '@web/lib/http-response';
import {
	mcpEnterpriseAuthorizationExtensionIdentifier,
	mcpOauthClientCredentialsExtensionIdentifier,
	mcpProtocolVersion,
	mcpUiExtensionIdentifier,
} from '@web/lib/mcp-protocol-constants';
import { createRateLimitedResponse } from '@web/lib/rate-limit-response';
import {
	enforceOauthRegistrationRateLimit,
	enforceOauthTokenRateLimit,
} from '@web/lib/request-rate-limiter';
import type { RequestContext } from '@web/lib/request-context';
import { evaluateEnterpriseAuthorizationPolicy } from '@web/lib/enterprise-authorization-policy';
import { isValidRedirectUri } from '@web/lib/validate-redirect-uri';
import { OauthAuthorizePage } from '@web/views/oauth-authorize-page';

const supportedGrantTypes = ['authorization_code', 'refresh_token', 'client_credentials'] as const;
const supportedResponseTypes = ['code'] as const;
const supportedTokenEndpointAuthenticationMethods = ['client_secret_post', 'none'] as const;

const oauthRegistrationSchema = z.object({
	client_name: z.string().min(1).default('Unknown Client'),
	redirect_uris: z
		.array(z.string().url())
		.min(1, 'At least one redirect URI is required')
		.refine(
			(uris) => uris.every(isValidRedirectUri),
			'Redirect URIs must use HTTPS (or http://localhost for development)',
		),
	grant_types: z
		.array(z.enum(supportedGrantTypes))
		.default(['authorization_code', 'refresh_token']),
	response_types: z.array(z.enum(supportedResponseTypes)).default(['code']),
	token_endpoint_auth_method: z
		.enum(supportedTokenEndpointAuthenticationMethods)
		.default('client_secret_post'),
});

function getFormString(formData: FormData, key: string): string | null {
	const value = formData.get(key);
	if (typeof value !== 'string') {
		return null;
	}

	return value;
}

function buildOauthSignInRedirectPath(requestUrl: URL): string {
	const callbackPath = `${requestUrl.pathname}${requestUrl.search}`;
	return `/auth/google/start?callback_path=${encodeURIComponent(callbackPath)}`;
}

function parseRequestBodyForTokenEndpoint(request: Request): Promise<Record<string, string>> {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/x-www-form-urlencoded')) {
		return request
			.formData()
			.then((formData) => Object.fromEntries(formData.entries()) as Record<string, string>);
	}

	if (contentType.includes('application/json')) {
		return request.json();
	}

	throw new Error('unsupported_content_type');
}

function issueTokens() {
	const accessToken = randomBytes(48).toString('hex');
	const refreshToken = randomBytes(48).toString('hex');
	const tokenTimeToLiveSeconds = environment.MCP_TOKEN_TTL_SECONDS;
	const refreshTimeToLiveSeconds = environment.MCP_REFRESH_TOKEN_TTL_SECONDS;

	return {
		accessToken,
		accessTokenHash: hashCredential(accessToken),
		refreshToken,
		refreshTokenHash: hashCredential(refreshToken),
		tokenTimeToLiveSeconds,
		accessTokenExpiresAt: new Date(Date.now() + tokenTimeToLiveSeconds * 1000),
		refreshTokenExpiresAt: new Date(Date.now() + refreshTimeToLiveSeconds * 1000),
	};
}

async function validateClientRedirectUri(clientId: string, redirectUri: string): Promise<boolean> {
	if (!isValidRedirectUri(redirectUri)) {
		return false;
	}

	const [client] = await database
		.select()
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientId, clientId))
		.limit(1);

	if (!client) {
		return false;
	}

	if (client.redirectUris.length === 0) {
		return false;
	}

	return client.redirectUris.includes(redirectUri);
}

export async function handleOauthAuthorizeGet(context: RequestContext): Promise<Response> {
	if (!context.user) {
		return redirectResponse(buildOauthSignInRedirectPath(context.requestUrl));
	}

	const clientId = context.requestUrl.searchParams.get('client_id');
	const redirectUri = context.requestUrl.searchParams.get('redirect_uri');
	const responseType = context.requestUrl.searchParams.get('response_type');
	const codeChallenge = context.requestUrl.searchParams.get('code_challenge');
	const codeChallengeMethod = context.requestUrl.searchParams.get('code_challenge_method');
	const state = context.requestUrl.searchParams.get('state') || '';

	if (!clientId || !redirectUri || responseType !== 'code' || !codeChallenge) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: (
				<OauthAuthorizePage
					mode="error"
					error="Invalid OAuth parameters. Missing required fields."
				/>
			),
		});
	}

	if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: (
				<OauthAuthorizePage mode="error" error="Only S256 code challenge method is supported." />
			),
		});
	}

	const [client] = await database
		.select()
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientId, clientId))
		.limit(1);

	if (!client) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: <OauthAuthorizePage mode="error" error="Unknown OAuth client." />,
		});
	}

	if (client.redirectUris.length === 0 || !client.redirectUris.includes(redirectUri)) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: <OauthAuthorizePage mode="error" error="Invalid redirect URI." />,
		});
	}

	return createStaticHtmlResponse({
		metadata: { title: 'OAuth Authorize' },
		body: (
			<OauthAuthorizePage
				mode="form"
				clientName={client.clientName}
				clientId={clientId}
				redirectUri={redirectUri}
				codeChallenge={codeChallenge}
				codeChallengeMethod={codeChallengeMethod || 'S256'}
				state={state}
				user={context.user}
			/>
		),
	});
}

export async function handleOauthAuthorizeApprove(context: RequestContext): Promise<Response> {
	if (!context.user) {
		return jsonResponse({ error: 'unauthorized' }, { status: 401 });
	}

	const formData = await context.request.formData();
	const clientId = getFormString(formData, 'client_id');
	const redirectUri = getFormString(formData, 'redirect_uri');
	const codeChallenge = getFormString(formData, 'code_challenge');
	const codeChallengeMethod = getFormString(formData, 'code_challenge_method') || 'S256';
	const state = getFormString(formData, 'state');

	if (!clientId || !redirectUri || !codeChallenge) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Missing required fields.' },
			{ status: 400 },
		);
	}

	if (codeChallengeMethod !== 'S256') {
		return jsonResponse(
			{
				error: 'invalid_request',
				message: 'Only S256 code challenge method is supported.',
			},
			{ status: 400 },
		);
	}

	const validRedirectUri = await validateClientRedirectUri(clientId, redirectUri);
	if (!validRedirectUri) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Invalid redirect URI for this client.' },
			{ status: 400 },
		);
	}

	const code = randomBytes(32).toString('hex');
	await database.insert(schema.oauthCodes).values({
		code: hashCredential(code),
		clientId,
		userId: context.user.id,
		redirectUri,
		codeChallenge,
		codeChallengeMethod,
		state,
		expiresAt: new Date(Date.now() + 10 * 60 * 1000),
	});

	const redirectUrl = new URL(redirectUri);
	redirectUrl.searchParams.set('code', code);
	if (state) {
		redirectUrl.searchParams.set('state', state);
	}

	return redirectResponse(redirectUrl.toString(), 302);
}

export async function handleOauthAuthorizeDeny(context: RequestContext): Promise<Response> {
	if (!context.user) {
		return jsonResponse({ error: 'unauthorized' }, { status: 401 });
	}

	const formData = await context.request.formData();
	const clientId = getFormString(formData, 'client_id');
	const redirectUri = getFormString(formData, 'redirect_uri');
	const state = getFormString(formData, 'state');

	if (!clientId || !redirectUri) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Missing redirect URI.' },
			{ status: 400 },
		);
	}

	const validRedirectUri = await validateClientRedirectUri(clientId, redirectUri);
	if (!validRedirectUri) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Invalid redirect URI for this client.' },
			{ status: 400 },
		);
	}

	const redirectUrl = new URL(redirectUri);
	redirectUrl.searchParams.set('error', 'access_denied');
	redirectUrl.searchParams.set('error_description', 'The user denied the authorization request.');
	if (state) {
		redirectUrl.searchParams.set('state', state);
	}

	return redirectResponse(redirectUrl.toString(), 302);
}

export async function handleOauthRegisterPost(context: RequestContext): Promise<Response> {
	const rateLimitResult = await enforceOauthRegistrationRateLimit({
		request: context.request,
		fallbackClientAddress: context.clientAddress,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds, oauthCorsHeaders);
	}

	let requestBody: unknown;
	try {
		requestBody = await context.request.json();
	} catch {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'Invalid JSON body' },
			{ status: 400, headers: oauthCorsHeaders },
		);
	}

	const parsedBody = oauthRegistrationSchema.safeParse(requestBody);
	if (!parsedBody.success) {
		return jsonResponse(
			{
				error: 'invalid_client_metadata',
				error_description: parsedBody.error.issues.map((issue) => issue.message).join('; '),
			},
			{ status: 400, headers: oauthCorsHeaders },
		);
	}

	const { client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method } =
		parsedBody.data;
	const includesClientCredentialsGrant = grant_types.includes('client_credentials');

	if (includesClientCredentialsGrant && !environment.MCP_ENABLE_CLIENT_CREDENTIALS) {
		return jsonResponse(
			{
				error: 'invalid_client_metadata',
				error_description: 'client_credentials is disabled on this server.',
			},
			{ status: 400, headers: oauthCorsHeaders },
		);
	}

	if (token_endpoint_auth_method === 'none' && includesClientCredentialsGrant) {
		return jsonResponse(
			{
				error: 'invalid_client_metadata',
				error_description:
					'client_credentials requires token_endpoint_auth_method=client_secret_post.',
			},
			{ status: 400, headers: oauthCorsHeaders },
		);
	}

	if (token_endpoint_auth_method === 'none' && grant_types.includes('refresh_token')) {
		return jsonResponse(
			{
				error: 'invalid_client_metadata',
				error_description: 'refresh_token requires token_endpoint_auth_method=client_secret_post.',
			},
			{ status: 400, headers: oauthCorsHeaders },
		);
	}

	const clientId = randomUUID();
	const clientSecret = randomBytes(32).toString('hex');
	const serviceAccountUserId = includesClientCredentialsGrant ? randomUUID() : null;

	if (serviceAccountUserId) {
		await database.insert(schema.users).values({
			id: serviceAccountUserId,
			email: `mcp-service-${clientId}@local.invalid`,
			name: `${client_name} service account`,
			image: null,
			emailVerified: true,
			role: 'service',
		});
	}

	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: hashCredential(clientSecret),
		clientName: client_name,
		clientType: token_endpoint_auth_method === 'none' ? 'public' : 'confidential',
		tokenEndpointAuthMethod: token_endpoint_auth_method,
		serviceAccountUserId,
		redirectUris: redirect_uris,
		grantTypes: grant_types,
		responseTypes: response_types,
	});

	return jsonResponse(
		{
			client_id: clientId,
			client_secret: clientSecret,
			client_name,
			redirect_uris,
			grant_types,
			response_types,
			token_endpoint_auth_method,
			client_id_issued_at: Math.floor(Date.now() / 1000),
			client_secret_expires_at: 0,
		},
		{ status: 201, headers: oauthCorsHeaders },
	);
}

async function handleOauthTokenAuthorizationCodeGrant(
	body: Record<string, string>,
): Promise<Response> {
	const tokenResponseHeaders = {
		'Cache-Control': 'no-store',
		Pragma: 'no-cache',
		...oauthCorsHeaders,
	};

	const { code, redirect_uri, client_id, client_secret, code_verifier } = body;
	if (!code || !redirect_uri || !client_id || !code_verifier) {
		return jsonResponse(
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
		return jsonResponse(
			{ error: 'invalid_client' },
			{ status: 401, headers: tokenResponseHeaders },
		);
	}

	if (!client.grantTypes.includes('authorization_code')) {
		return jsonResponse(
			{
				error: 'unauthorized_client',
				error_description: 'Client is not authorized for authorization_code.',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (client.tokenEndpointAuthMethod === 'client_secret_post') {
		if (!client_secret) {
			return jsonResponse(
				{ error: 'invalid_client' },
				{ status: 401, headers: tokenResponseHeaders },
			);
		}

		if (!constantTimeEquals(client.clientSecret, hashCredential(client_secret))) {
			return jsonResponse(
				{ error: 'invalid_client' },
				{ status: 401, headers: tokenResponseHeaders },
			);
		}
	}

	if (client.tokenEndpointAuthMethod === 'none' && client_secret) {
		return jsonResponse(
			{ error: 'invalid_client' },
			{ status: 401, headers: tokenResponseHeaders },
		);
	}

	const authorizationCodeHash = hashCredential(code);
	const [authorizationCode] = await database
		.select()
		.from(schema.oauthCodes)
		.where(
			and(
				eq(schema.oauthCodes.code, authorizationCodeHash),
				eq(schema.oauthCodes.clientId, client_id),
				isNull(schema.oauthCodes.usedAt),
				gt(schema.oauthCodes.expiresAt, new Date()),
			),
		)
		.limit(1);

	if (!authorizationCode) {
		return jsonResponse(
			{
				error: 'invalid_grant',
				error_description: 'Authorization code not found, already used, or expired',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (authorizationCode.redirectUri !== redirect_uri) {
		return jsonResponse(
			{ error: 'invalid_grant', error_description: 'Redirect URI mismatch' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const challenge = createHash('sha256').update(code_verifier).digest('base64url');
	if (!constantTimeEquals(challenge, authorizationCode.codeChallenge)) {
		return jsonResponse(
			{ error: 'invalid_grant', error_description: 'PKCE verification failed' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const [consumedCode] = await database
		.update(schema.oauthCodes)
		.set({ usedAt: new Date() })
		.where(and(eq(schema.oauthCodes.code, authorizationCodeHash), isNull(schema.oauthCodes.usedAt)))
		.returning();

	if (!consumedCode) {
		return jsonResponse(
			{ error: 'invalid_grant', error_description: 'Authorization code already used' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const enterpriseDecision = await evaluateEnterpriseAuthorizationPolicy({
		clientId: authorizationCode.clientId,
		userId: authorizationCode.userId,
		action: 'issue_token',
	});
	if (!enterpriseDecision.allowed) {
		return jsonResponse(
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

	return jsonResponse(
		{
			access_token: tokens.accessToken,
			token_type: 'Bearer',
			expires_in: tokens.tokenTimeToLiveSeconds,
			refresh_token: tokens.refreshToken,
			scope: authorizationCode.scope || '',
		},
		{ headers: tokenResponseHeaders },
	);
}

async function handleOauthTokenRefreshGrant(body: Record<string, string>): Promise<Response> {
	const tokenResponseHeaders = {
		'Cache-Control': 'no-store',
		Pragma: 'no-cache',
		...oauthCorsHeaders,
	};

	const { refresh_token, client_id, client_secret } = body;
	if (!refresh_token) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'Missing refresh_token parameter' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}
	if (!client_id) {
		return jsonResponse(
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
		return jsonResponse(
			{ error: 'invalid_client' },
			{ status: 401, headers: tokenResponseHeaders },
		);
	}
	if (!client.grantTypes.includes('refresh_token')) {
		return jsonResponse(
			{
				error: 'unauthorized_client',
				error_description: 'Client is not authorized for refresh_token.',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (client.tokenEndpointAuthMethod === 'client_secret_post') {
		if (!client_secret) {
			return jsonResponse(
				{ error: 'invalid_client' },
				{ status: 401, headers: tokenResponseHeaders },
			);
		}

		if (!constantTimeEquals(client.clientSecret, hashCredential(client_secret))) {
			return jsonResponse(
				{ error: 'invalid_client' },
				{ status: 401, headers: tokenResponseHeaders },
			);
		}
	}

	const refreshTokenHash = hashCredential(refresh_token);
	const [revokedRefreshToken] = await database
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
	if (!revokedRefreshToken) {
		return jsonResponse(
			{
				error: 'invalid_grant',
				error_description: 'Refresh token not found, already used, or expired',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (revokedRefreshToken.clientId !== client_id) {
		return jsonResponse(
			{ error: 'invalid_grant', error_description: 'Client ID mismatch' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	await database
		.update(schema.oauthTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(schema.oauthTokens.accessToken, revokedRefreshToken.accessTokenHash),
				isNull(schema.oauthTokens.revokedAt),
			),
		);

	const enterpriseDecision = await evaluateEnterpriseAuthorizationPolicy({
		clientId: revokedRefreshToken.clientId,
		userId: revokedRefreshToken.userId,
		action: 'issue_token',
	});
	if (!enterpriseDecision.allowed) {
		return jsonResponse(
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
		clientId: revokedRefreshToken.clientId,
		userId: revokedRefreshToken.userId,
		scope: revokedRefreshToken.scope || '',
		expiresAt: tokens.accessTokenExpiresAt,
	});
	await database.insert(schema.oauthRefreshTokens).values({
		refreshToken: tokens.refreshTokenHash,
		clientId: revokedRefreshToken.clientId,
		userId: revokedRefreshToken.userId,
		scope: revokedRefreshToken.scope || '',
		accessTokenHash: tokens.accessTokenHash,
		expiresAt: tokens.refreshTokenExpiresAt,
	});

	return jsonResponse(
		{
			access_token: tokens.accessToken,
			token_type: 'Bearer',
			expires_in: tokens.tokenTimeToLiveSeconds,
			refresh_token: tokens.refreshToken,
			scope: revokedRefreshToken.scope || '',
		},
		{ headers: tokenResponseHeaders },
	);
}

async function handleOauthTokenClientCredentialsGrant(
	body: Record<string, string>,
): Promise<Response> {
	const tokenResponseHeaders = {
		'Cache-Control': 'no-store',
		Pragma: 'no-cache',
		...oauthCorsHeaders,
	};

	if (!environment.MCP_ENABLE_CLIENT_CREDENTIALS) {
		return jsonResponse(
			{
				error: 'unsupported_grant_type',
				error_description: 'client_credentials is disabled on this server',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const { client_id, client_secret, scope } = body;
	if (!client_id || !client_secret) {
		return jsonResponse(
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
		return jsonResponse(
			{ error: 'invalid_client' },
			{ status: 401, headers: tokenResponseHeaders },
		);
	}

	if (!constantTimeEquals(client.clientSecret, hashCredential(client_secret))) {
		return jsonResponse(
			{ error: 'invalid_client' },
			{ status: 401, headers: tokenResponseHeaders },
		);
	}

	if (!client.grantTypes.includes('client_credentials')) {
		return jsonResponse(
			{
				error: 'unauthorized_client',
				error_description: 'Client is not authorized for client_credentials.',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (!client.serviceAccountUserId) {
		return jsonResponse(
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
		return jsonResponse(
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

	return jsonResponse(
		{
			access_token: tokens.accessToken,
			token_type: 'Bearer',
			expires_in: tokens.tokenTimeToLiveSeconds,
			scope: scope ?? '',
		},
		{ headers: tokenResponseHeaders },
	);
}

export async function handleOauthRevokePost(context: RequestContext): Promise<Response> {
	const rateLimitResult = await enforceOauthTokenRateLimit({
		request: context.request,
		fallbackClientAddress: context.clientAddress,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds, {
			'Cache-Control': 'no-store',
			Pragma: 'no-cache',
			...oauthCorsHeaders,
		});
	}

	const revocationResponseHeaders = {
		'Cache-Control': 'no-store',
		Pragma: 'no-cache',
		...oauthCorsHeaders,
	};

	let body: Record<string, string>;
	try {
		body = await parseRequestBodyForTokenEndpoint(context.request);
	} catch {
		return jsonResponse(
			{ error: 'unsupported_content_type' },
			{ status: 400, headers: revocationResponseHeaders },
		);
	}

	const { token, token_type_hint } = body;
	if (!token) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'Missing token parameter' },
			{ status: 400, headers: revocationResponseHeaders },
		);
	}

	const tokenHash = hashCredential(token);

	if (token_type_hint !== 'refresh_token') {
		const [revokedAccessToken] = await database
			.update(schema.oauthTokens)
			.set({ revokedAt: new Date() })
			.where(
				and(eq(schema.oauthTokens.accessToken, tokenHash), isNull(schema.oauthTokens.revokedAt)),
			)
			.returning();

		if (revokedAccessToken) {
			return new Response(null, { status: 200, headers: revocationResponseHeaders });
		}
	}

	if (token_type_hint !== 'access_token') {
		const [revokedRefreshToken] = await database
			.update(schema.oauthRefreshTokens)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(schema.oauthRefreshTokens.refreshToken, tokenHash),
					isNull(schema.oauthRefreshTokens.revokedAt),
				),
			)
			.returning();

		if (revokedRefreshToken) {
			await database
				.update(schema.oauthTokens)
				.set({ revokedAt: new Date() })
				.where(
					and(
						eq(schema.oauthTokens.accessToken, revokedRefreshToken.accessTokenHash),
						isNull(schema.oauthTokens.revokedAt),
					),
				);

			return new Response(null, { status: 200, headers: revocationResponseHeaders });
		}
	}

	// RFC 7009: Return 200 even if token was not found or already revoked
	return new Response(null, { status: 200, headers: revocationResponseHeaders });
}

export async function handleOauthTokenPost(context: RequestContext): Promise<Response> {
	let body: Record<string, string>;
	try {
		body = await parseRequestBodyForTokenEndpoint(context.request);
	} catch {
		return jsonResponse(
			{ error: 'unsupported_content_type' },
			{
				status: 400,
				headers: {
					'Cache-Control': 'no-store',
					Pragma: 'no-cache',
					...oauthCorsHeaders,
				},
			},
		);
	}

	const rateLimitResult = await enforceOauthTokenRateLimit({
		request: context.request,
		clientId: body.client_id,
		fallbackClientAddress: context.clientAddress,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds, {
			'Cache-Control': 'no-store',
			Pragma: 'no-cache',
			...oauthCorsHeaders,
		});
	}

	if (body.grant_type === 'authorization_code') {
		return handleOauthTokenAuthorizationCodeGrant(body);
	}
	if (body.grant_type === 'refresh_token') {
		return handleOauthTokenRefreshGrant(body);
	}
	if (body.grant_type === 'client_credentials') {
		return handleOauthTokenClientCredentialsGrant(body);
	}

	return jsonResponse(
		{ error: 'unsupported_grant_type' },
		{
			status: 400,
			headers: {
				'Cache-Control': 'no-store',
				Pragma: 'no-cache',
				...oauthCorsHeaders,
			},
		},
	);
}

export async function handleOauthAuthorizationMetadataGet(
	context: RequestContext,
): Promise<Response> {
	const baseUrl = getBaseUrl(context.request);
	return jsonResponse(
		{
			issuer: baseUrl,
			authorization_endpoint: `${baseUrl}/oauth/authorize`,
			token_endpoint: `${baseUrl}/oauth/token`,
			registration_endpoint: `${baseUrl}/oauth/register`,
			revocation_endpoint: `${baseUrl}/oauth/revoke`,
			response_types_supported: ['code'],
			grant_types_supported: environment.MCP_ENABLE_CLIENT_CREDENTIALS
				? ['authorization_code', 'refresh_token', 'client_credentials']
				: ['authorization_code', 'refresh_token'],
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
			extensions: {
				...(environment.MCP_ENABLE_UI_EXTENSION ? { [mcpUiExtensionIdentifier]: {} } : {}),
				...(environment.MCP_ENABLE_CLIENT_CREDENTIALS
					? { [mcpOauthClientCredentialsExtensionIdentifier]: {} }
					: {}),
				...(environment.MCP_ENABLE_ENTERPRISE_AUTH
					? { [mcpEnterpriseAuthorizationExtensionIdentifier]: {} }
					: {}),
			},
		},
		{ headers: oauthCorsHeaders },
	);
}

export async function handleOauthProtectedResourceMetadataGet(
	context: RequestContext,
): Promise<Response> {
	const baseUrl = getBaseUrl(context.request);
	return jsonResponse(
		{
			resource: `${baseUrl}/mcp`,
			authorization_servers: [baseUrl],
		},
		{ headers: oauthCorsHeaders },
	);
}

export async function handleOauthProtectedResourceMcpMetadataGet(
	context: RequestContext,
): Promise<Response> {
	const baseUrl = getBaseUrl(context.request);
	return jsonResponse(
		{
			resource: `${baseUrl}/mcp`,
			authorization_servers: [baseUrl],
			bearer_methods_supported: ['header'],
			mcp_protocol_version: mcpProtocolVersion,
		},
		{ headers: oauthCorsHeaders },
	);
}
