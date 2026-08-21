import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { database, schema } from '@template/database';
import { environment } from '@web/env';
import { getBaseUrl } from '@web/lib/base-url';
import { getMcpResourceUrl } from '@web/lib/mcp-request-context';
import { oauthCorsHeaders } from '@web/lib/cors';
import { constantTimeEquals } from '@web/lib/constant-time-equals';
import {
	consumeAuthorizationTransaction,
	createAuthorizationTransaction,
} from '@web/lib/authorization-transaction';
import { isValidClientName } from '@web/lib/client-name-validation';
import { isTrustedRequestOrigin } from '@web/lib/csrf-protection';
import { hashCredential } from '@web/lib/hash-credential';
import { createStaticHtmlResponse } from '@web/lib/html-response';
import { jsonResponse, redirectResponse } from '@web/lib/http-response';
import {
	mcpLatestProtocolVersion,
	mcpUiExtensionIdentifier,
} from '@web/lib/mcp-protocol-constants';
import { createRateLimitedResponse } from '@web/lib/rate-limit-response';
import {
	enforceOauthAuthorizeRateLimit,
	enforceOauthRegistrationRateLimit,
	enforceOauthRevokeRateLimit,
	enforceOauthTokenClientRateLimit,
	enforceOauthTokenNetworkRateLimit,
	isAuthenticationLockedOut,
	recordFailedAuthentication,
} from '@web/lib/request-rate-limiter';
import type { RequestContext } from '@web/lib/request-context';
import { isValidRedirectUri } from '@web/lib/validate-redirect-uri';
import { OauthAuthorizePage } from '@web/views/oauth-authorize-page';
import {
	PayloadTooLargeError,
	readBoundedFormUrlEncoded,
	readBoundedJson,
} from '@web/lib/bounded-request-body';
import { isExactContentType } from '@web/lib/exact-content-type';
import { isValidPkceCodeChallenge, isValidPkceCodeVerifier } from '@web/lib/pkce-validation';
import { findDuplicateParameterName } from '@web/lib/reject-duplicate-parameters';
import {
	oauthAuthorizeApproveMaxBodyBytes,
	oauthAuthorizeDenyMaxBodyBytes,
	oauthCsrfTokenLength,
	oauthMaxClientIdLength,
	oauthMaxClientNameLength,
	oauthMaxGrantTypeCount,
	oauthMaxRedirectUriCount,
	oauthMaxRedirectUriLength,
	oauthMaxResponseTypeCount,
	oauthMaxStateLength,
	oauthMaxTokenLength,
	oauthRegisterMaxBodyBytes,
	oauthRevokeMaxBodyBytes,
	oauthTokenMaxBodyBytes,
	oauthTransactionIdLength,
} from '@web/lib/request-limits';

/**
 * Headers applied to every authenticated or credential-bearing HTML/JSON
 * response this file returns directly (SEC-005 / S-10): the consent page,
 * OAuth error pages, and the DCR registration response. Token/revoke
 * responses already carry their own `no-store` headers (RFC 6749 §5.1
 * predates this item); this constant exists for the responses that did
 * not. `Vary: Cookie` ensures a shared or CDN cache in front of this
 * server can never key a cached response across two different sessions.
 */
const oauthNoStoreHeaders: Record<string, string> = {
	'Cache-Control': 'no-store, private',
	Pragma: 'no-cache',
	Vary: 'Cookie',
};

const supportedGrantTypes = ['authorization_code', 'refresh_token'] as const;
const supportedResponseTypes = ['code'] as const;
const supportedTokenEndpointAuthenticationMethods = ['client_secret_post', 'none'] as const;

const oauthRegistrationSchema = z.object({
	client_name: z
		.string()
		.min(1)
		.max(oauthMaxClientNameLength)
		.refine(
			isValidClientName,
			'client_name must not contain control, bidirectional-override, or zero-width characters',
		)
		.default('Unknown Client'),
	redirect_uris: z
		.array(z.string().url().max(oauthMaxRedirectUriLength))
		.min(1, 'At least one redirect URI is required')
		.max(oauthMaxRedirectUriCount)
		.refine(
			(uris) => uris.every(isValidRedirectUri),
			'Redirect URIs must use HTTPS (or http://localhost for development)',
		),
	grant_types: z
		.array(z.enum(supportedGrantTypes))
		.max(oauthMaxGrantTypeCount)
		.default(['authorization_code', 'refresh_token']),
	response_types: z
		.array(z.enum(supportedResponseTypes))
		.max(oauthMaxResponseTypeCount)
		.default(['code']),
	token_endpoint_auth_method: z
		.enum(supportedTokenEndpointAuthenticationMethods)
		.default('client_secret_post'),
});

function getSearchParamString(searchParams: URLSearchParams, key: string): string | null {
	return searchParams.get(key);
}

function buildOauthSignInRedirectPath(requestUrl: URL): string {
	const callbackPath = `${requestUrl.pathname}${requestUrl.search}`;
	return `/auth/google/start?callback_path=${encodeURIComponent(callbackPath)}`;
}

/**
 * The known token/revoke endpoint parameters, checked for duplicates
 * (RFC 6749 §3.1: a parameter appearing more than once is ambiguous, not
 * merely redundant) before the body is handed to grant-specific handling.
 */
const tokenEndpointParameterNames = [
	'grant_type',
	'code',
	'redirect_uri',
	'client_id',
	'client_secret',
	'code_verifier',
	'refresh_token',
	'token',
	'token_type_hint',
] as const;

class UnsupportedContentTypeError extends Error {
	constructor() {
		super('unsupported_content_type');
	}
}

class DuplicateParameterOauthError extends Error {
	constructor(public readonly parameterName: string) {
		super(`Duplicate parameter: ${parameterName}`);
	}
}

class ScalarParameterOauthError extends Error {
	constructor(public readonly parameterName: string) {
		super(`Parameter must be a single string value: ${parameterName}`);
	}
}

/**
 * Reads and validates a token/revoke endpoint body under a byte limit,
 * rejecting anything but the two OAuth-recognized content types (exact
 * match, no sniffing), duplicate parameters, and JSON values that are not
 * plain strings (an array where a scalar is required).
 */
async function parseRequestBodyForTokenEndpoint(
	request: Request,
	maxBodyBytes: number,
): Promise<Record<string, string>> {
	const contentTypeHeader = request.headers.get('content-type');

	if (isExactContentType(contentTypeHeader, 'application/x-www-form-urlencoded')) {
		const searchParams = await readBoundedFormUrlEncoded(request, maxBodyBytes);
		const duplicateParameterName = findDuplicateParameterName(
			searchParams,
			tokenEndpointParameterNames,
		);
		if (duplicateParameterName) {
			throw new DuplicateParameterOauthError(duplicateParameterName);
		}
		return Object.fromEntries(searchParams.entries());
	}

	if (isExactContentType(contentTypeHeader, 'application/json')) {
		const parsedBody = await readBoundedJson(request, maxBodyBytes);
		if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
			throw new ScalarParameterOauthError('(request body)');
		}

		const body: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsedBody as Record<string, unknown>)) {
			if (typeof value !== 'string') {
				throw new ScalarParameterOauthError(key);
			}
			body[key] = value;
		}
		return body;
	}

	throw new UnsupportedContentTypeError();
}

/**
 * Maps every failure mode `parseRequestBodyForTokenEndpoint` can throw to a
 * stable OAuth error response: a declared-or-actual size overflow is `413`,
 * an unrecognized `Content-Type` is `unsupported_content_type`, and a
 * duplicate parameter, non-string JSON value, or invalid-UTF-8 body is
 * `invalid_request` — never a generic 500, and never a database write
 * beforehand.
 */
function respondToOauthBodyError(error: unknown, headers: Record<string, string>): Response {
	if (error instanceof PayloadTooLargeError) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'Request body too large' },
			{ status: 413, headers },
		);
	}
	if (error instanceof UnsupportedContentTypeError) {
		return jsonResponse({ error: 'unsupported_content_type' }, { status: 400, headers });
	}
	if (error instanceof DuplicateParameterOauthError || error instanceof ScalarParameterOauthError) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: error.message },
			{ status: 400, headers },
		);
	}
	return jsonResponse(
		{ error: 'invalid_request', error_description: 'Malformed request body' },
		{ status: 400, headers },
	);
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

export async function handleOauthAuthorizeGet(context: RequestContext): Promise<Response> {
	const rateLimitResult = await enforceOauthAuthorizeRateLimit({
		networkIdentity: context.networkIdentity,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds);
	}

	if (!context.user) {
		return redirectResponse(buildOauthSignInRedirectPath(context.requestUrl));
	}

	const authorizeParameterNames = [
		'client_id',
		'redirect_uri',
		'response_type',
		'code_challenge',
		'code_challenge_method',
		'state',
	] as const;
	const duplicateParameterName = findDuplicateParameterName(
		context.requestUrl.searchParams,
		authorizeParameterNames,
	);
	if (duplicateParameterName) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: (
				<OauthAuthorizePage
					mode="error"
					error={`Duplicate OAuth parameter: ${duplicateParameterName}.`}
				/>
			),
		});
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

	if (
		clientId.length > oauthMaxClientIdLength ||
		redirectUri.length > oauthMaxRedirectUriLength ||
		state.length > oauthMaxStateLength
	) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: <OauthAuthorizePage mode="error" error="A parameter exceeded its maximum length." />,
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

	if (!isValidPkceCodeChallenge(codeChallenge)) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: <OauthAuthorizePage mode="error" error="Malformed code_challenge." />,
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

	// S-09: consumed once, atomically, by approve/deny — every authoritative
	// value below is reloaded from this row, never trusted from the form.
	const transaction = await createAuthorizationTransaction({
		userId: context.user.id,
		sessionToken: context.sessionToken!,
		clientId,
		redirectUri,
		codeChallenge,
		codeChallengeMethod: codeChallengeMethod || 'S256',
		state: state || null,
		issuer: getBaseUrl(context.request),
	});

	// Defense in depth against a client name registered before this check
	// existed (or a defect in the registration-time check): never render a
	// name containing control, bidirectional-override, or zero-width
	// characters, even if it somehow made it into the database.
	const displayClientName = isValidClientName(client.clientName)
		? client.clientName
		: 'the requesting application';

	return createStaticHtmlResponse({
		metadata: { title: 'OAuth Authorize' },
		body: (
			<OauthAuthorizePage
				mode="form"
				clientName={displayClientName}
				redirectUri={redirectUri}
				transactionId={transaction.transactionId}
				csrfToken={transaction.csrfToken}
				user={context.user}
			/>
		),
	});
}

const authorizeFormParameterNames = ['transaction_id', 'csrf_token'] as const;

export async function handleOauthAuthorizeApprove(context: RequestContext): Promise<Response> {
	if (!context.user || !context.sessionToken) {
		return jsonResponse({ error: 'unauthorized' }, { status: 401 });
	}

	if (!isTrustedRequestOrigin(context.request, getBaseUrl(context.request))) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Cross-site request rejected.' },
			{
				status: 403,
			},
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
		formParameters = await readBoundedFormUrlEncoded(
			context.request,
			oauthAuthorizeApproveMaxBodyBytes,
		);
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

	const duplicateParameterName = findDuplicateParameterName(
		formParameters,
		authorizeFormParameterNames,
	);
	if (duplicateParameterName) {
		return jsonResponse(
			{ error: 'invalid_request', message: `Duplicate parameter: ${duplicateParameterName}.` },
			{ status: 400 },
		);
	}

	const transactionId = getSearchParamString(formParameters, 'transaction_id');
	const csrfToken = getSearchParamString(formParameters, 'csrf_token');

	if (!transactionId || !csrfToken) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Missing transaction_id or csrf_token.' },
			{ status: 400 },
		);
	}

	if (transactionId.length > oauthTransactionIdLength || csrfToken.length > oauthCsrfTokenLength) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'A parameter exceeded its maximum length.' },
			{ status: 400 },
		);
	}

	const transaction = await consumeAuthorizationTransaction({
		transactionId,
		csrfToken,
		userId: context.user.id,
		sessionToken: context.sessionToken,
	});
	if (!transaction) {
		return jsonResponse(
			{
				error: 'invalid_request',
				message: 'Authorization transaction not found, already used, expired, or invalid.',
			},
			{ status: 400 },
		);
	}

	const code = randomBytes(32).toString('hex');
	await database.insert(schema.oauthCodes).values({
		code: hashCredential(code),
		clientId: transaction.clientId,
		userId: context.user.id,
		redirectUri: transaction.redirectUri,
		codeChallenge: transaction.codeChallenge,
		codeChallengeMethod: transaction.codeChallengeMethod,
		state: transaction.state,
		expiresAt: new Date(Date.now() + 10 * 60 * 1000),
	});

	const redirectUrl = new URL(transaction.redirectUri);
	redirectUrl.searchParams.set('code', code);
	if (transaction.state) {
		redirectUrl.searchParams.set('state', transaction.state);
	}

	return redirectResponse(redirectUrl.toString(), 302);
}

export async function handleOauthAuthorizeDeny(context: RequestContext): Promise<Response> {
	if (!context.user || !context.sessionToken) {
		return jsonResponse({ error: 'unauthorized' }, { status: 401 });
	}

	if (!isTrustedRequestOrigin(context.request, getBaseUrl(context.request))) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Cross-site request rejected.' },
			{
				status: 403,
			},
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
		formParameters = await readBoundedFormUrlEncoded(
			context.request,
			oauthAuthorizeDenyMaxBodyBytes,
		);
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

	const duplicateParameterName = findDuplicateParameterName(
		formParameters,
		authorizeFormParameterNames,
	);
	if (duplicateParameterName) {
		return jsonResponse(
			{ error: 'invalid_request', message: `Duplicate parameter: ${duplicateParameterName}.` },
			{ status: 400 },
		);
	}

	const transactionId = getSearchParamString(formParameters, 'transaction_id');
	const csrfToken = getSearchParamString(formParameters, 'csrf_token');

	if (!transactionId || !csrfToken) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Missing transaction_id or csrf_token.' },
			{ status: 400 },
		);
	}

	if (transactionId.length > oauthTransactionIdLength || csrfToken.length > oauthCsrfTokenLength) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'A parameter exceeded its maximum length.' },
			{ status: 400 },
		);
	}

	const transaction = await consumeAuthorizationTransaction({
		transactionId,
		csrfToken,
		userId: context.user.id,
		sessionToken: context.sessionToken,
	});
	if (!transaction) {
		return jsonResponse(
			{
				error: 'invalid_request',
				message: 'Authorization transaction not found, already used, expired, or invalid.',
			},
			{ status: 400 },
		);
	}

	const redirectUrl = new URL(transaction.redirectUri);
	redirectUrl.searchParams.set('error', 'access_denied');
	redirectUrl.searchParams.set('error_description', 'The user denied the authorization request.');
	if (transaction.state) {
		redirectUrl.searchParams.set('state', transaction.state);
	}

	return redirectResponse(redirectUrl.toString(), 302);
}

export async function handleOauthRegisterPost(context: RequestContext): Promise<Response> {
	const rateLimitResult = await enforceOauthRegistrationRateLimit({
		networkIdentity: context.networkIdentity,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds, {
			...oauthCorsHeaders,
			...oauthNoStoreHeaders,
		});
	}

	if (!isExactContentType(context.request.headers.get('content-type'), 'application/json')) {
		return jsonResponse(
			{
				error: 'invalid_client_metadata',
				error_description: 'Content-Type must be application/json',
			},
			{ status: 400, headers: { ...oauthCorsHeaders, ...oauthNoStoreHeaders } },
		);
	}

	let requestBody: unknown;
	try {
		requestBody = await readBoundedJson(context.request, oauthRegisterMaxBodyBytes);
	} catch (error) {
		if (error instanceof PayloadTooLargeError) {
			return jsonResponse(
				{ error: 'invalid_client_metadata', error_description: 'Request body too large' },
				{ status: 413, headers: { ...oauthCorsHeaders, ...oauthNoStoreHeaders } },
			);
		}
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'Invalid JSON body' },
			{ status: 400, headers: { ...oauthCorsHeaders, ...oauthNoStoreHeaders } },
		);
	}

	const parsedBody = oauthRegistrationSchema.safeParse(requestBody);
	if (!parsedBody.success) {
		return jsonResponse(
			{
				error: 'invalid_client_metadata',
				error_description: parsedBody.error.issues.map((issue) => issue.message).join('; '),
			},
			{ status: 400, headers: { ...oauthCorsHeaders, ...oauthNoStoreHeaders } },
		);
	}

	const { client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method } =
		parsedBody.data;

	if (token_endpoint_auth_method === 'none' && grant_types.includes('refresh_token')) {
		return jsonResponse(
			{
				error: 'invalid_client_metadata',
				error_description: 'refresh_token requires token_endpoint_auth_method=client_secret_post.',
			},
			{ status: 400, headers: { ...oauthCorsHeaders, ...oauthNoStoreHeaders } },
		);
	}

	const clientId = randomUUID();
	const clientSecret = randomBytes(32).toString('hex');

	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: hashCredential(clientSecret),
		clientName: client_name,
		clientType: token_endpoint_auth_method === 'none' ? 'public' : 'confidential',
		tokenEndpointAuthMethod: token_endpoint_auth_method,
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
		{ status: 201, headers: { ...oauthCorsHeaders, ...oauthNoStoreHeaders } },
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

	if (
		code.length > oauthMaxTokenLength ||
		redirect_uri.length > oauthMaxRedirectUriLength ||
		client_id.length > oauthMaxClientIdLength
	) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'A parameter exceeded its maximum length' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	// RFC 7636 §4.1: validate `code_verifier` syntax and length before it is
	// ever hashed or compared, and before any database work runs.
	if (!isValidPkceCodeVerifier(code_verifier)) {
		return jsonResponse(
			{ error: 'invalid_grant', error_description: 'Malformed code_verifier' },
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

	if (refresh_token.length > oauthMaxTokenLength || client_id.length > oauthMaxClientIdLength) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'A parameter exceeded its maximum length' },
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

export async function handleOauthRevokePost(context: RequestContext): Promise<Response> {
	const rateLimitResult = await enforceOauthRevokeRateLimit({
		networkIdentity: context.networkIdentity,
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
		body = await parseRequestBodyForTokenEndpoint(context.request, oauthRevokeMaxBodyBytes);
	} catch (error) {
		return respondToOauthBodyError(error, revocationResponseHeaders);
	}

	const { token, token_type_hint } = body;
	if (!token) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'Missing token parameter' },
			{ status: 400, headers: revocationResponseHeaders },
		);
	}

	if (token.length > oauthMaxTokenLength) {
		return jsonResponse(
			{
				error: 'invalid_request',
				error_description: 'token parameter exceeded its maximum length',
			},
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

const tokenEndpointNoStoreHeaders = {
	'Cache-Control': 'no-store',
	Pragma: 'no-cache',
	...oauthCorsHeaders,
};

async function handleOauthTokenPostInner(context: RequestContext): Promise<Response> {
	let body: Record<string, string>;
	try {
		body = await parseRequestBodyForTokenEndpoint(context.request, oauthTokenMaxBodyBytes);
	} catch (error) {
		return respondToOauthBodyError(error, tokenEndpointNoStoreHeaders);
	}

	if (body.client_id) {
		const clientRateLimitResult = await enforceOauthTokenClientRateLimit({
			networkIdentity: context.networkIdentity,
			clientId: body.client_id,
		});
		if (!clientRateLimitResult.allowed) {
			return createRateLimitedResponse(
				clientRateLimitResult.retryAfterSeconds,
				tokenEndpointNoStoreHeaders,
			);
		}
	}

	if (body.grant_type === 'authorization_code') {
		return handleOauthTokenAuthorizationCodeGrant(body);
	}
	if (body.grant_type === 'refresh_token') {
		return handleOauthTokenRefreshGrant(body);
	}

	return jsonResponse(
		{ error: 'unsupported_grant_type' },
		{ status: 400, headers: tokenEndpointNoStoreHeaders },
	);
}

export async function handleOauthTokenPost(context: RequestContext): Promise<Response> {
	if (await isAuthenticationLockedOut({ networkIdentity: context.networkIdentity })) {
		return jsonResponse(
			{ error: 'invalid_client', error_description: 'Too many failed authentication attempts.' },
			{ status: 429, headers: tokenEndpointNoStoreHeaders },
		);
	}

	// Cheap, network-scoped check applied before the (more expensive) body
	// parse and database work below. `handleOauthTokenPostInner` layers a
	// second, client-scoped check on top once the client is known.
	const networkRateLimitResult = await enforceOauthTokenNetworkRateLimit({
		networkIdentity: context.networkIdentity,
	});
	if (!networkRateLimitResult.allowed) {
		return createRateLimitedResponse(
			networkRateLimitResult.retryAfterSeconds,
			tokenEndpointNoStoreHeaders,
		);
	}

	const response = await handleOauthTokenPostInner(context);
	if (response.status === 400 || response.status === 401) {
		await recordFailedAuthentication({ networkIdentity: context.networkIdentity });
	}
	return response;
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
			grant_types_supported: ['authorization_code', 'refresh_token'],
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
			extensions: {
				...(environment.MCP_ENABLE_UI_EXTENSION ? { [mcpUiExtensionIdentifier]: {} } : {}),
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
			resource: getMcpResourceUrl(context.request),
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
			resource: getMcpResourceUrl(context.request),
			authorization_servers: [baseUrl],
			bearer_methods_supported: ['header'],
			mcp_protocol_version: mcpLatestProtocolVersion,
		},
		{ headers: oauthCorsHeaders },
	);
}
