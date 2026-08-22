import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { database, schema } from '@template/database';
import {
	environment as mcpEnvironment,
	getSupportedScopes,
	hasRegisteredUiExtensionResource,
	isMcpScope,
	mcpScopeDescriptions,
} from '@template/mcp';
import { logger } from '@template/mcp/logger';
import { metricsCollector } from '@template/mcp/metrics';
import { environment } from '@web/env';
import { getBaseUrl } from '@web/lib/base-url';
import { getMcpResourceUrl } from '@web/lib/mcp-request-context';
import { oauthCorsHeaders } from '@web/lib/cors';
import { constantTimeEquals } from '@web/lib/constant-time-equals';
import {
	consumeAuthorizationTransaction,
	createAuthorizationTransaction,
	unconsumeAuthorizationTransaction,
} from '@web/lib/authorization-transaction';
import { isValidClientName } from '@web/lib/client-name-validation';
import {
	fetchClientIdMetadataDocument,
	isClientIdMetadataDocumentUrl,
} from '@web/lib/client-metadata-documents';
import { isTrustedRequestOrigin } from '@web/lib/csrf-protection';
import { OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS } from '@web/lib/credential-lifecycle-policy';
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
import { redirectUriMatchesRegistered } from '@web/lib/redirect-uri-matching';
import { isValidRedirectUri } from '@web/lib/validate-redirect-uri';
import { OauthAuthorizePage } from '@web/views/oauth-authorize-page';
import {
	PayloadTooLargeError,
	readBoundedFormUrlEncoded,
	readBoundedJson,
} from '@web/lib/bounded-request-body';
import { isExactContentType } from '@web/lib/exact-content-type';
import { isValidPkceCodeChallenge, isValidPkceCodeVerifier } from '@web/lib/pkce-validation';
import {
	canonicalizeScopes,
	isScopeSubsetOf,
	parseRefreshScopeRequest,
	parseRequestedScope,
	splitScopeString,
} from '@web/lib/oauth-scope';
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
	oauthMaxResourceLength,
	oauthMaxResponseTypeCount,
	oauthMaxScopeLength,
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
/**
 * OAUTH-002 / SEP-837: OpenID Connect Dynamic Client Registration's
 * `application_type`. Optional here, never defaulted — the roadmap's
 * compatibility contract requires Claude Code's loopback callback
 * redirect URIs keep working for a client that never sends this field at
 * all, so absence must not be silently coerced into either value.
 */
const supportedApplicationTypes = ['web', 'native'] as const;

function redirectUrisMatchApplicationType(
	uris: string[],
	applicationType: (typeof supportedApplicationTypes)[number] | undefined,
): boolean {
	// `web` apps have no legitimate use for a loopback redirect URI (SEP-837:
	// avoiding the OIDC redirect-URI conflict this exists to prevent means
	// actually enforcing the distinction once a client opts into declaring
	// one). `native` and "unspecified" are unchanged from the pre-existing
	// HTTPS-or-loopback behavior every current connector relies on.
	if (applicationType !== 'web') return true;
	return uris.every((uri) => new URL(uri).protocol === 'https:');
}

const oauthRegistrationSchema = z
	.object({
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
		application_type: z.enum(supportedApplicationTypes).optional(),
	})
	.superRefine((data, ctx) => {
		if (!redirectUrisMatchApplicationType(data.redirect_uris, data.application_type)) {
			ctx.addIssue({
				code: 'custom',
				message: 'application_type "web" requires every redirect_uri to use HTTPS.',
				path: ['redirect_uris'],
			});
		}
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
	'resource',
	'scope',
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
		'resource',
		'scope',
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
	const resource = context.requestUrl.searchParams.get('resource');
	const rawScope = context.requestUrl.searchParams.get('scope');

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

	// OAUTH-001 / RFC 8707: this server has exactly one protected resource
	// (the MCP endpoint), so `resource` must be present and must name it
	// exactly — never inferred from what the client happened to ask for.
	// Rejecting a missing or mismatched value here, before any client
	// lookup or transaction is created, is what makes every authorization
	// code (and everything minted from it) provably scoped to this
	// resource rather than merely labeled with it after the fact.
	if (!resource || resource !== getMcpResourceUrl(context.request)) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: (
				<OauthAuthorizePage
					mode="error"
					error="Missing or unsupported resource parameter. resource must exactly match this server's MCP resource URL."
				/>
			),
		});
	}

	if (
		clientId.length > oauthMaxClientIdLength ||
		redirectUri.length > oauthMaxRedirectUriLength ||
		state.length > oauthMaxStateLength ||
		resource.length > oauthMaxResourceLength ||
		(rawScope && rawScope.length > oauthMaxScopeLength)
	) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: <OauthAuthorizePage mode="error" error="A parameter exceeded its maximum length." />,
		});
	}

	// AUTHZ-001 / RFC 6749 §3.3: an unrecognized scope token is rejected
	// outright, before any client lookup or transaction is created — the
	// same fail-fast placement as the resource check above. A request that
	// names no `scope` at all gets this server's pre-defined default (every
	// scope it supports); see `parseRequestedScope`'s own comment for why.
	const scopeRequest = parseRequestedScope(rawScope);
	if (!scopeRequest.ok) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: (
				<OauthAuthorizePage
					mode="error"
					error={
						scopeRequest.unknownScopes.length > 0
							? `Unsupported scope: ${scopeRequest.unknownScopes.join(', ')}.`
							: 'The scope parameter must not be empty.'
					}
				/>
			),
		});
	}
	const grantedScope = canonicalizeScopes(scopeRequest.scopes);

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

	type OauthClientRow = typeof schema.oauthClients.$inferSelect;
	let client: OauthClientRow | undefined;

	// OAUTH-002 / MCP 2026-07-28: an HTTPS `client_id` is a Client ID
	// Metadata Document identifier, not a DCR `client_id` (always a
	// `randomUUID()`, never CIMD-shaped) — fetch, validate, and upsert it
	// on EVERY authorization request that names one, not only the first
	// time. `fetchClientIdMetadataDocument` caches successful fetches for
	// `cimdCacheTtlMs`, so a repeat authorize within that window is an
	// in-memory hit, not a new network call. Re-fetching every time (rather
	// than only when no row exists yet) is what makes a client's own
	// `redirect_uris` update — e.g. removing a compromised one — actually
	// take effect here, per the spec's "authorization servers MUST
	// validate redirect URIs presented in an authorization request against
	// those in the metadata document." A row from an earlier successful
	// fetch that a later fetch cannot revalidate is treated as unknown
	// rather than trusted indefinitely on stale data.
	if (isClientIdMetadataDocumentUrl(clientId)) {
		const document = await fetchClientIdMetadataDocument(clientId);
		if (document) {
			const now = new Date();
			const values = {
				clientId: document.clientId,
				clientSecret: null,
				clientName: document.clientName,
				clientType: 'public' as const,
				tokenEndpointAuthMethod: 'none' as const,
				applicationType: document.applicationType,
				redirectUris: document.redirectUris,
				grantTypes: document.grantTypes,
				responseTypes: document.responseTypes,
				clientIdMetadataUrl: document.clientId,
				updatedAt: now,
			};
			[client] = await database
				.insert(schema.oauthClients)
				.values(values)
				.onConflictDoUpdate({
					target: schema.oauthClients.clientId,
					set: {
						clientName: values.clientName,
						applicationType: values.applicationType,
						redirectUris: values.redirectUris,
						grantTypes: values.grantTypes,
						responseTypes: values.responseTypes,
						updatedAt: values.updatedAt,
					},
				})
				.returning();
		}
	} else {
		[client] = await database
			.select()
			.from(schema.oauthClients)
			.where(eq(schema.oauthClients.clientId, clientId))
			.limit(1);
	}

	if (!client) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			body: <OauthAuthorizePage mode="error" error="Unknown OAuth client." />,
		});
	}

	// OAUTH-004 / RFC 8252 §7.3: exact string match for every redirect URI
	// except a registered loopback one, where the port is deliberately
	// allowed to differ from whatever was registered — see
	// `redirect-uri-matching.ts`. `isValidRedirectUri` is passed in (not
	// imported by the matcher) so a request carrying a fragment or
	// embedded userinfo is rejected before the port-flexible comparison
	// ever runs.
	if (
		client.redirectUris.length === 0 ||
		!redirectUriMatchesRegistered(redirectUri, client.redirectUris, isValidRedirectUri)
	) {
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
		resource,
		scope: grantedScope,
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
				scopes={splitScopeString(grantedScope).map((scope) => ({
					scope,
					description: isMcpScope(scope) ? mcpScopeDescriptions[scope] : scope,
				}))}
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
	try {
		await database.insert(schema.oauthCodes).values({
			code: hashCredential(code),
			clientId: transaction.clientId,
			userId: context.user.id,
			redirectUri: transaction.redirectUri,
			codeChallenge: transaction.codeChallenge,
			codeChallengeMethod: transaction.codeChallengeMethod,
			state: transaction.state,
			resource: transaction.resource,
			// AUTHZ-001: the exact scope the consent screen displayed and the
			// user approved — never re-derived from the form, only ever carried
			// forward from the transaction row `handleOauthAuthorizeGet` created.
			scope: transaction.scope,
			expiresAt: new Date(Date.now() + 10 * 60 * 1000),
		});
	} catch (error) {
		// Review finding: neon-http has no multi-statement transaction support
		// (see `OAUTH-003`'s note on the identical limitation for refresh-token
		// rotation), so this insert cannot be folded into the same atomic
		// statement as `consumeAuthorizationTransaction` above. Without this,
		// a transient failure here would leave the one-time transaction
		// already spent and no code minted -- the browser's approval form
		// could never be retried. No code was ever generated into a response
		// (the insert itself threw), so reopening the transaction cannot cause
		// a code to be issued twice. Best-effort: if this also fails, the
		// transaction stays consumed and the caller is in exactly today's
		// (pre-fix) situation, no worse.
		try {
			await unconsumeAuthorizationTransaction(transactionId);
		} catch (unconsumeError) {
			logger.error(
				{ err: unconsumeError },
				'Failed to reopen authorization transaction after a failed code insert',
			);
		}
		throw error;
	}

	const redirectUrl = new URL(transaction.redirectUri);
	redirectUrl.searchParams.set('code', code);
	if (transaction.state) {
		redirectUrl.searchParams.set('state', transaction.state);
	}
	// OAUTH-004 / RFC 9207: the issuer identifier this authorization was
	// issued under, bound at authorize time (`transaction.issuer`), never
	// re-derived from the current request — a client validates this
	// against the issuer it expects before redeeming the code, which is
	// exactly the mix-up attack RFC 9207 exists to close.
	redirectUrl.searchParams.set('iss', transaction.issuer);

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
	// RFC 9207 §2.4 covers error responses too, not only successful ones —
	// see the identical comment on the approve handler above.
	redirectUrl.searchParams.set('iss', transaction.issuer);

	// OBS-001: distinguishable from every other authorization outcome —
	// `clientId` is public identifier, never a secret.
	logger.info(
		{ event: 'oauth_authorization', outcome: 'user_denied', clientId: transaction.clientId },
		'User denied authorization request',
	);
	metricsCollector.recordEvent('authorization', 'user_denied');

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

	const {
		client_name,
		redirect_uris,
		grant_types,
		response_types,
		token_endpoint_auth_method,
		application_type,
	} = parsedBody.data;

	// OAUTH-002: a public client authenticates with PKCE alone and has no
	// secure channel to receive a secret over, so one is never generated or
	// stored for it — not even a value the response withholds. A `null`
	// `clientSecret` column is the only representation of "this client has
	// no secret" this schema allows.
	const isPublicClient = token_endpoint_auth_method === 'none';
	const clientId = randomUUID();
	const clientSecret = isPublicClient ? null : randomBytes(32).toString('hex');
	// DATA-001 / S-18: "client secrets never expire" — every confidential
	// client's secret now gets a real expiry at issuance, enforced by
	// `authenticateOauthClient` below. Null for a public client, which never
	// has a secret to expire.
	const clientSecretExpiresAt = clientSecret
		? new Date(Date.now() + OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS)
		: null;

	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: clientSecret ? hashCredential(clientSecret) : null,
		clientSecretExpiresAt,
		clientName: client_name,
		clientType: isPublicClient ? 'public' : 'confidential',
		tokenEndpointAuthMethod: token_endpoint_auth_method,
		applicationType: application_type ?? null,
		redirectUris: redirect_uris,
		grantTypes: grant_types,
		responseTypes: response_types,
	});

	// OBS-001: "registration" is one of the eight outcomes the roadmap
	// requires operators to be able to distinguish without inspecting
	// secrets — `clientId` is an opaque identifier, never the issued secret.
	logger.info(
		{ event: 'oauth_client_registration', outcome: 'success', clientId, isPublicClient },
		'OAuth client registered',
	);
	metricsCollector.recordEvent('registration', 'success');

	return jsonResponse(
		{
			client_id: clientId,
			// RFC 7591 §3.2.1: `client_secret`/`client_secret_expires_at` are
			// only present when a secret was actually issued. DATA-001 / S-18:
			// `client_secret_expires_at` now reports the real epoch-seconds
			// expiry instead of the RFC's "0 means never expires" sentinel —
			// this server always sets a real expiry for a confidential client.
			...(clientSecret && clientSecretExpiresAt
				? {
						client_secret: clientSecret,
						client_secret_expires_at: Math.floor(clientSecretExpiresAt.getTime() / 1000),
					}
				: {}),
			client_name,
			redirect_uris,
			grant_types,
			response_types,
			token_endpoint_auth_method,
			...(application_type ? { application_type } : {}),
			client_id_issued_at: Math.floor(Date.now() / 1000),
		},
		{ status: 201, headers: { ...oauthCorsHeaders, ...oauthNoStoreHeaders } },
	);
}

type OauthClientAuthenticationResult =
	{ ok: true; client: typeof schema.oauthClients.$inferSelect } | { ok: false; response: Response };

/**
 * OAUTH-003 / S-02: the one place every client-authenticated OAuth endpoint
 * (both token grants and, below, revocation) verifies a client's identity,
 * so "authenticate before any mutation" is enforced identically everywhere
 * instead of being repeated -- and potentially drifting -- at each call
 * site. Looks the client up, then verifies `client_secret_post` credentials
 * in constant time, or rejects an unexpected secret from a `none` client.
 * Performs no database write and consults no token row, so a failed
 * authentication attempt here can never have mutated anything.
 */
async function authenticateOauthClient(
	clientId: string,
	clientSecret: string | undefined,
	responseHeaders: HeadersInit,
): Promise<OauthClientAuthenticationResult> {
	const invalidClient = (): OauthClientAuthenticationResult => {
		// OBS-001: distinguishable from every other outcome; `clientId` is the
		// caller-presented public identifier, never the secret it failed to
		// authenticate with.
		logger.warn(
			{ event: 'oauth_client_authentication', outcome: 'invalid_client', clientId },
			'OAuth client authentication failed',
		);
		metricsCollector.recordEvent('client_authentication', 'invalid_client');
		return {
			ok: false,
			response: jsonResponse(
				{ error: 'invalid_client' },
				{ status: 401, headers: responseHeaders },
			),
		};
	};

	const [client] = await database
		.select()
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientId, clientId))
		.limit(1);
	if (!client) {
		return invalidClient();
	}

	if (client.tokenEndpointAuthMethod === 'client_secret_post') {
		// `client.clientSecret` is only ever null for a `none` client (OAUTH-002);
		// a `client_secret_post` client without a stored secret is a data
		// inconsistency this must fail closed on, never treat as "no secret required".
		if (!clientSecret || !client.clientSecret) {
			return invalidClient();
		}
		if (!constantTimeEquals(client.clientSecret, hashCredential(clientSecret))) {
			return invalidClient();
		}
		// DATA-001 / S-18 acceptance criterion 5: a secret past its own
		// `clientSecretExpiresAt` is rejected outright, even if the value
		// still matches the stored hash. `null` means no expiry was ever
		// recorded for this row (a pre-existing client from before this
		// column existed) — not an exemption from expiring, but nothing to
		// compare against, so it is treated as "not yet expired" rather than
		// silently locking out every legacy client.
		if (client.clientSecretExpiresAt && client.clientSecretExpiresAt.getTime() <= Date.now()) {
			return invalidClient();
		}
	}

	if (client.tokenEndpointAuthMethod === 'none' && clientSecret) {
		return invalidClient();
	}

	return { ok: true, client };
}

/**
 * OAUTH-003: reuse-detection response for refresh-token rotation.
 * `familyId` is constant across every refresh token descended from one
 * authorization-code exchange, carried forward unchanged on each rotation
 * (`oauth_refresh_tokens.family_id`). Revoking a family marks every
 * not-yet-revoked member revoked and revokes whichever access token(s)
 * those rows still reference and have not themselves already been revoked.
 * In the ordinary case there is exactly one live member -- rotation always
 * revokes the previous member immediately -- but this stays correct if a
 * race ever produced more than one live member in the same family.
 */
async function revokeOauthRefreshTokenFamily(familyId: string): Promise<void> {
	const revokedFamilyMembers = await database
		.update(schema.oauthRefreshTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(schema.oauthRefreshTokens.familyId, familyId),
				isNull(schema.oauthRefreshTokens.revokedAt),
			),
		)
		.returning({ accessTokenHash: schema.oauthRefreshTokens.accessTokenHash });

	const liveAccessTokenHashes = revokedFamilyMembers.map((member) => member.accessTokenHash);
	if (liveAccessTokenHashes.length === 0) {
		return;
	}

	await database
		.update(schema.oauthTokens)
		.set({ revokedAt: new Date() })
		.where(
			and(
				inArray(schema.oauthTokens.accessToken, liveAccessTokenHashes),
				isNull(schema.oauthTokens.revokedAt),
			),
		);
}

async function handleOauthTokenAuthorizationCodeGrant(
	body: Record<string, string>,
	request: Request,
): Promise<Response> {
	const tokenResponseHeaders = {
		'Cache-Control': 'no-store',
		Pragma: 'no-cache',
		...oauthCorsHeaders,
	};

	const { code, redirect_uri, client_id, client_secret, code_verifier, resource } = body;
	if (!code || !redirect_uri || !client_id || !code_verifier || !resource) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'Missing required parameters' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (
		code.length > oauthMaxTokenLength ||
		redirect_uri.length > oauthMaxRedirectUriLength ||
		client_id.length > oauthMaxClientIdLength ||
		resource.length > oauthMaxResourceLength
	) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'A parameter exceeded its maximum length' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	// OAUTH-001 / RFC 8707 §2: the token request's `resource` must name the
	// same, single, canonical MCP resource this server ever issues codes
	// for. Checked before any client or code lookup, so a request for the
	// wrong resource never reaches the database at all.
	if (resource !== getMcpResourceUrl(request)) {
		// OBS-001: distinguishable from every other token-exchange outcome;
		// `resource` is a caller-supplied URL, never a credential.
		logger.warn(
			{
				event: 'oauth_token_exchange',
				outcome: 'invalid_resource',
				grantType: 'authorization_code',
			},
			'Token request named an unsupported resource',
		);
		metricsCollector.recordEvent('token_exchange', 'invalid_resource');
		return jsonResponse(
			{
				error: 'invalid_target',
				error_description: "resource does not match this server's MCP resource URL",
			},
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

	const authentication = await authenticateOauthClient(
		client_id,
		client_secret,
		tokenResponseHeaders,
	);
	if (!authentication.ok) {
		return authentication.response;
	}
	const { client } = authentication;

	if (!client.grantTypes.includes('authorization_code')) {
		return jsonResponse(
			{
				error: 'unauthorized_client',
				error_description: 'Client is not authorized for authorization_code.',
			},
			{ status: 400, headers: tokenResponseHeaders },
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

	// Defense in depth: the request-level check above already rejected any
	// `resource` that is not this server's canonical MCP resource. This
	// additionally proves the code itself was issued for that same
	// resource — relevant if configuration ever changes between the
	// authorize and token requests — before any token is minted.
	if (authorizationCode.resource !== resource) {
		logger.warn(
			{
				event: 'oauth_token_exchange',
				outcome: 'invalid_resource',
				grantType: 'authorization_code',
			},
			'Authorization code resource mismatch',
		);
		metricsCollector.recordEvent('token_exchange', 'invalid_resource');
		return jsonResponse(
			{
				error: 'invalid_target',
				error_description: 'resource does not match the authorization code',
			},
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
		resource: authorizationCode.resource,
		expiresAt: tokens.accessTokenExpiresAt,
	});
	await database.insert(schema.oauthRefreshTokens).values({
		refreshToken: tokens.refreshTokenHash,
		clientId: authorizationCode.clientId,
		userId: authorizationCode.userId,
		scope: authorizationCode.scope || '',
		resource: authorizationCode.resource,
		accessTokenHash: tokens.accessTokenHash,
		// OAUTH-003: the authorization-code exchange starts a new refresh-token
		// lineage, so this refresh token is the root of its own family. Every
		// token this one rotates into carries the same familyId forward.
		familyId: randomUUID(),
		expiresAt: tokens.refreshTokenExpiresAt,
	});

	metricsCollector.recordEvent('token_exchange', 'success');

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

async function handleOauthTokenRefreshGrant(
	body: Record<string, string>,
	request: Request,
): Promise<Response> {
	const tokenResponseHeaders = {
		'Cache-Control': 'no-store',
		Pragma: 'no-cache',
		...oauthCorsHeaders,
	};

	const { refresh_token, client_id, client_secret, resource, scope: rawRefreshScope } = body;
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
	if (!resource) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'Missing resource parameter' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	if (
		refresh_token.length > oauthMaxTokenLength ||
		client_id.length > oauthMaxClientIdLength ||
		resource.length > oauthMaxResourceLength ||
		(rawRefreshScope !== undefined && rawRefreshScope.length > oauthMaxScopeLength)
	) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'A parameter exceeded its maximum length' },
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	// OAUTH-001 / RFC 8707 §2: the refreshed access token must stay bound to
	// the same single canonical MCP resource as every other token this
	// server issues. Checked before any database work.
	if (resource !== getMcpResourceUrl(request)) {
		logger.warn(
			{ event: 'oauth_token_exchange', outcome: 'invalid_resource', grantType: 'refresh_token' },
			'Refresh request named an unsupported resource',
		);
		metricsCollector.recordEvent('refresh', 'invalid_resource');
		return jsonResponse(
			{
				error: 'invalid_target',
				error_description: "resource does not match this server's MCP resource URL",
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	// AUTHZ-001 / RFC 6749 §6: an unrecognized scope token in an explicit
	// refresh-time `scope` request is rejected before any database work —
	// same fail-fast placement as the resource check above. Whether the
	// requested set is actually a *subset* of what this refresh token was
	// originally granted can only be checked once the token's own stored
	// scope is known, below.
	const refreshScopeRequest = parseRefreshScopeRequest(rawRefreshScope);
	if (!refreshScopeRequest.ok) {
		return jsonResponse(
			{
				error: 'invalid_scope',
				error_description: `Unsupported scope: ${refreshScopeRequest.unknownScopes.join(', ')}`,
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	const authentication = await authenticateOauthClient(
		client_id,
		client_secret,
		tokenResponseHeaders,
	);
	if (!authentication.ok) {
		return authentication.response;
	}
	const { client } = authentication;

	if (!client.grantTypes.includes('refresh_token')) {
		return jsonResponse(
			{
				error: 'unauthorized_client',
				error_description: 'Client is not authorized for refresh_token.',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	// Shared predicate every lookup and the mutating rotation below must
	// agree on: this exact token, owned by the authenticated client, for
	// the already-validated resource, not yet revoked, not yet expired.
	const refreshTokenHash = hashCredential(refresh_token);
	const activeRefreshTokenPredicate = and(
		eq(schema.oauthRefreshTokens.refreshToken, refreshTokenHash),
		eq(schema.oauthRefreshTokens.clientId, client.clientId),
		eq(schema.oauthRefreshTokens.resource, resource),
		isNull(schema.oauthRefreshTokens.revokedAt),
		gt(schema.oauthRefreshTokens.expiresAt, new Date()),
	);

	// Distinguishes "this exact token was already rotated" (reuse of a
	// previously-issued refresh token -- a signal that token has leaked,
	// per the OAuth Security BCP's refresh-token rotation-reuse guidance)
	// from every other reason a request can land here (token never
	// existed, wrong owning client, wrong resource, expired) via a
	// read-only lookup by hash alone, bound to the authenticated client and
	// resource -- the same two conditions the mutating predicate above
	// requires. Without that binding, presenting a *different* client's
	// already-revoked (rotated-away) refresh token value under one's own
	// valid credentials would let any registered client trigger family
	// revocation -- and thus a denial-of-service -- on a token family it
	// never owned, merely by possessing a stale hash value. Never logs the
	// token or its hash -- only the family identifier.
	async function respondToRefreshTokenNotFound(): Promise<Response> {
		const [existingByHash] = await database
			.select({
				familyId: schema.oauthRefreshTokens.familyId,
				revokedAt: schema.oauthRefreshTokens.revokedAt,
			})
			.from(schema.oauthRefreshTokens)
			.where(
				and(
					eq(schema.oauthRefreshTokens.refreshToken, refreshTokenHash),
					eq(schema.oauthRefreshTokens.clientId, client.clientId),
					eq(schema.oauthRefreshTokens.resource, resource),
				),
			)
			.limit(1);

		if (existingByHash?.revokedAt) {
			await revokeOauthRefreshTokenFamily(existingByHash.familyId);
			// OBS-001: this is the source event for the roadmap's "refresh
			// replay" alert — see RUNBOOK.md.
			logger.warn(
				{
					event: 'oauth_token_exchange',
					outcome: 'refresh_replay',
					familyId: existingByHash.familyId,
				},
				'refresh token reuse detected; revoked token family',
			);
			metricsCollector.recordEvent('refresh', 'replay_detected');
		}

		return jsonResponse(
			{
				error: 'invalid_grant',
				error_description: 'Refresh token not found, already used, or expired',
			},
			{ status: 400, headers: tokenResponseHeaders },
		);
	}

	// AUTHZ-001 / RFC 6749 §6: "the requested scope MUST NOT include any
	// scope not originally granted." An explicit refresh-time `scope`
	// request that is not a subset of what this refresh token actually
	// carries must be rejected *before* the token is consumed -- a refresh
	// token is single-use, and this codebase's atomic revoke-then-check
	// rotation pattern (see below) does not itself un-revoke a token once
	// the mutating UPDATE has run. Read-only, so it cannot itself let a
	// race succeed twice: whether or not this read observes the token as
	// still live, the actual consumption below is still governed
	// exclusively by the atomic `UPDATE ... WHERE ... RETURNING`
	// statement's own predicate, which is what OAUTH-003/S-02 requires for
	// correctness under concurrency -- this read only decides whether to
	// attempt that statement at all, never whether it succeeds.
	if (refreshScopeRequest.scope !== undefined) {
		const [currentRefreshToken] = await database
			.select({ scope: schema.oauthRefreshTokens.scope })
			.from(schema.oauthRefreshTokens)
			.where(activeRefreshTokenPredicate)
			.limit(1);

		if (!currentRefreshToken) {
			return respondToRefreshTokenNotFound();
		}

		const grantedRefreshScopes = splitScopeString(currentRefreshToken.scope || '');
		if (!isScopeSubsetOf(refreshScopeRequest.scope, grantedRefreshScopes)) {
			return jsonResponse(
				{
					error: 'invalid_scope',
					error_description:
						'Requested scope exceeds the scope originally granted to this refresh token.',
				},
				{ status: 400, headers: tokenResponseHeaders },
			);
		}
	}

	// OAUTH-003 / S-02: bind the single-use rotation predicate to the
	// authenticated client and the already-validated resource, atomically,
	// in the same UPDATE ... WHERE ... RETURNING statement that performs the
	// mutation. neon-http's driver has no multi-statement transaction
	// support (`db.transaction()` throws "No transactions support in
	// neon-http driver" -- confirmed directly against the installed driver),
	// so this single statement *is* the unit of atomicity here, the same
	// pattern SEC-003's rate-limiting Lua script and
	// authorization-transaction.ts's consume step already establish for
	// this codebase. Previously the client-id and resource checks ran
	// *after* this statement had already revoked the token, so a party
	// presenting another client's live refresh token under its own
	// client_id burned that token even though its own request was then
	// rejected -- a denial-of-service on a client it does not own, with no
	// benefit to the attacker. Folding both into the predicate means a
	// mismatched client or resource simply matches no row -- nothing is
	// mutated -- rather than mutating first and rejecting after.
	const [revokedRefreshToken] = await database
		.update(schema.oauthRefreshTokens)
		.set({ revokedAt: new Date() })
		.where(activeRefreshTokenPredicate)
		.returning();

	if (!revokedRefreshToken) {
		// Nothing matched the predicate above, so nothing was mutated by this
		// request. This can still happen even after the scope pre-check above
		// passed -- e.g. a concurrent request rotated or revoked the token in
		// between -- so the same not-found/reuse-detection handling applies.
		return respondToRefreshTokenNotFound();
	}

	// Omitted `scope` carries the stored grant forward unchanged; an
	// explicit (already-validated-as-a-subset, by the pre-check above)
	// request narrows it.
	const effectiveRefreshScope =
		refreshScopeRequest.scope !== undefined
			? canonicalizeScopes(refreshScopeRequest.scope)
			: revokedRefreshToken.scope || '';

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
		scope: effectiveRefreshScope,
		resource: revokedRefreshToken.resource,
		expiresAt: tokens.accessTokenExpiresAt,
	});
	await database.insert(schema.oauthRefreshTokens).values({
		refreshToken: tokens.refreshTokenHash,
		clientId: revokedRefreshToken.clientId,
		userId: revokedRefreshToken.userId,
		scope: effectiveRefreshScope,
		resource: revokedRefreshToken.resource,
		accessTokenHash: tokens.accessTokenHash,
		// OAUTH-003: rotation carries the family forward unchanged, so every
		// token descended from one authorization-code exchange stays
		// revocable as one lineage.
		familyId: revokedRefreshToken.familyId,
		expiresAt: tokens.refreshTokenExpiresAt,
	});

	metricsCollector.recordEvent('refresh', 'success');

	return jsonResponse(
		{
			access_token: tokens.accessToken,
			token_type: 'Bearer',
			expires_in: tokens.tokenTimeToLiveSeconds,
			refresh_token: tokens.refreshToken,
			scope: effectiveRefreshScope,
		},
		{ headers: tokenResponseHeaders },
	);
}

const revocationResponseHeaders = {
	'Cache-Control': 'no-store',
	Pragma: 'no-cache',
	...oauthCorsHeaders,
};

/**
 * OAUTH-003 / S-02: `/oauth/revoke` previously authenticated no client at
 * all -- any caller who knew a token's raw value (or could guess it) could
 * revoke it regardless of which client it belonged to. RFC 7009 §2.1
 * requires the same client authentication as the token endpoint, so this
 * reuses `authenticateOauthClient`. A failed authentication attempt reaches
 * no token row and performs no write, matching this item's "a failed
 * client-authentication attempt does not mutate the token" requirement.
 *
 * Once authenticated, the actual revoke mutations bind their `UPDATE ...
 * WHERE ...` predicate to the authenticated client's id (`eq(clientId,
 * client.clientId)`), atomically, the same pattern the refresh grant uses
 * below. A token that exists but belongs to a different client therefore
 * matches no row -- nothing is mutated -- and this handler still falls
 * through to the unconditional RFC 7009 §2.2 `200`, so a cross-client
 * revocation attempt neither succeeds nor is distinguishable from "token
 * not found" by its caller. That is what keeps the RFC's "return 200 even
 * for a token this server cannot find" contract intact while adding client
 * authentication: an authenticated client revoking a token it doesn't own
 * gets exactly the same response as one revoking a token that never
 * existed.
 */
async function handleOauthRevokePostInner(context: RequestContext): Promise<Response> {
	let body: Record<string, string>;
	try {
		body = await parseRequestBodyForTokenEndpoint(context.request, oauthRevokeMaxBodyBytes);
	} catch (error) {
		return respondToOauthBodyError(error, revocationResponseHeaders);
	}

	const { token, token_type_hint, client_id, client_secret } = body;
	if (!token) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'Missing token parameter' },
			{ status: 400, headers: revocationResponseHeaders },
		);
	}
	if (!client_id) {
		return jsonResponse(
			{ error: 'invalid_request', error_description: 'Missing client_id parameter' },
			{ status: 400, headers: revocationResponseHeaders },
		);
	}

	if (token.length > oauthMaxTokenLength || client_id.length > oauthMaxClientIdLength) {
		return jsonResponse(
			{
				error: 'invalid_request',
				error_description: 'A parameter exceeded its maximum length',
			},
			{ status: 400, headers: revocationResponseHeaders },
		);
	}

	const authentication = await authenticateOauthClient(
		client_id,
		client_secret,
		revocationResponseHeaders,
	);
	if (!authentication.ok) {
		return authentication.response;
	}
	const { client } = authentication;

	const tokenHash = hashCredential(token);

	if (token_type_hint !== 'refresh_token') {
		const [revokedAccessToken] = await database
			.update(schema.oauthTokens)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(schema.oauthTokens.accessToken, tokenHash),
					eq(schema.oauthTokens.clientId, client.clientId),
					isNull(schema.oauthTokens.revokedAt),
				),
			)
			.returning();

		if (revokedAccessToken) {
			metricsCollector.recordEvent('revocation', 'access_token_revoked');
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
					eq(schema.oauthRefreshTokens.clientId, client.clientId),
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

			metricsCollector.recordEvent('revocation', 'refresh_token_revoked');
			return new Response(null, { status: 200, headers: revocationResponseHeaders });
		}
	}

	// RFC 7009 §2.2: return 200 even if the token was not found, was already
	// revoked, or belongs to a different client than the one authenticated
	// above -- deliberately indistinguishable from each other so a response
	// never reveals whether a token exists or who owns it. The metric label
	// is safe to be more specific than the wire response: it never reaches
	// the caller.
	metricsCollector.recordEvent('revocation', 'not_found_or_already_revoked');
	return new Response(null, { status: 200, headers: revocationResponseHeaders });
}

export async function handleOauthRevokePost(context: RequestContext): Promise<Response> {
	// Mirrors `handleOauthTokenPost`'s failed-authentication lockout: without
	// it, `/oauth/revoke` would be a cheaper client-secret-guessing oracle
	// than `/oauth/token`, since it now performs the same constant-time
	// secret comparison but previously had no lockout guarding it.
	if (await isAuthenticationLockedOut({ networkIdentity: context.networkIdentity })) {
		return jsonResponse(
			{ error: 'invalid_client', error_description: 'Too many failed authentication attempts.' },
			{ status: 429, headers: revocationResponseHeaders },
		);
	}

	const rateLimitResult = await enforceOauthRevokeRateLimit({
		networkIdentity: context.networkIdentity,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds, revocationResponseHeaders);
	}

	const response = await handleOauthRevokePostInner(context);
	// Same reasoning as `handleOauthTokenPost`: `authenticateOauthClient` is
	// the sole source of a 401 (`invalid_client`) from this handler. Every
	// other rejection -- malformed bodies, unsupported content types,
	// missing token/client parameters, oversized values -- returns 400 and
	// never attempted client authentication, so it must not count toward
	// the shared lockout.
	if (response.status === 401) {
		await recordFailedAuthentication({ networkIdentity: context.networkIdentity });
	}
	return response;
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
		return handleOauthTokenAuthorizationCodeGrant(body, context.request);
	}
	if (body.grant_type === 'refresh_token') {
		return handleOauthTokenRefreshGrant(body, context.request);
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
	// Only an actual client-authentication failure should count toward the
	// shared network-wide lockout. `authenticateOauthClient` is the sole
	// source of a 401 from this handler (`invalid_client`); every other
	// rejection along this path -- malformed bodies, unsupported grants,
	// expired authorization codes, redirect mismatches, invalid PKCE,
	// resource errors, invalid scope requests -- returns 400 and is an
	// ordinary protocol error, not a failed authentication attempt.
	// Counting those too let ten unrelated protocol errors from one network
	// identity (a shared NAT or hosted connector egress address) trigger the
	// same five-minute lockout as ten wrong-secret guesses, locking out
	// every other client and user sharing that identity.
	if (response.status === 401) {
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
			// AUTHZ-001: the exact same list `handleOauthProtectedResourceMetadataGet`
			// and `handleOauthProtectedResourceMcpMetadataGet` below publish —
			// both derived from `getSupportedScopes()`, never hand-duplicated,
			// so "authorization server and protected-resource metadata publish
			// the same supported scopes" is mechanically true rather than
			// something that can drift.
			scopes_supported: getSupportedScopes(),
			// OAUTH-002 / MCP 2026-07-28: this is the exact key clients check
			// per the spec's "Advertising CIMD Support" section before using an
			// HTTPS URL as `client_id` instead of falling back to DCR.
			client_id_metadata_document_supported: true,
			// OAUTH-004 / RFC 9207: this server includes `iss` on every
			// authorization response (see `handleOauthAuthorizeApprove` and
			// `handleOauthAuthorizeDeny`), so it advertises the fact per the
			// RFC's own registered metadata field.
			authorization_response_iss_parameter_supported: true,
			// DOCS-001 / RFC 8414 sec. 2: human-readable documentation and legal
			// links, derived from the same canonical BASE_URL as every other
			// metadata field here — never a hardcoded or placeholder domain, so
			// they resolve against whatever host this server is actually
			// deployed to.
			service_documentation: `${baseUrl}/support`,
			op_policy_uri: `${baseUrl}/privacy`,
			op_tos_uri: `${baseUrl}/terms`,
			// Review finding: the real `/mcp` server capabilities (`server.ts`)
			// only advertise the UI extension when `MCP_ENABLE_UI_EXTENSION` is
			// set *and* at least one registered resource is actually an MCP App
			// (`hasRegisteredUiExtensionResource()`) -- `packages/mcp-apps` ships
			// no application today, so that predicate is always false in this
			// repository. This metadata document must apply the exact same
			// predicate; advertising the extension here on the flag alone would
			// let a client discover UI-extension support in OAuth metadata and
			// then receive server capabilities without it.
			extensions: {
				...(environment.MCP_ENABLE_UI_EXTENSION && hasRegisteredUiExtensionResource()
					? { [mcpUiExtensionIdentifier]: {} }
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
			resource: getMcpResourceUrl(context.request),
			authorization_servers: [baseUrl],
			scopes_supported: getSupportedScopes(),
			// DOCS-001 / RFC 9728 sec. 2: same documentation/legal links as the
			// authorization server metadata above, under this RFC's own field
			// names.
			resource_name: mcpEnvironment.MCP_SERVER_NAME,
			resource_documentation: `${baseUrl}/support`,
			resource_policy_uri: `${baseUrl}/privacy`,
			resource_tos_uri: `${baseUrl}/terms`,
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
			scopes_supported: getSupportedScopes(),
			resource_name: mcpEnvironment.MCP_SERVER_NAME,
			resource_documentation: `${baseUrl}/support`,
			resource_policy_uri: `${baseUrl}/privacy`,
			resource_tos_uri: `${baseUrl}/terms`,
		},
		{ headers: oauthCorsHeaders },
	);
}
