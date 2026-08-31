import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import {
	getEnvironment as getMcpEnvironment,
	isMcpScope,
	mcpScopeDescriptions,
} from '@lostgradient/mcp';
import { templateRegistry } from '@lostgradient/mcp';
import { logger } from '@lostgradient/mcp/logger';
import { metricsCollector } from '@lostgradient/mcp/metrics';
import { environment } from '@web/env';
import { getBaseUrl } from '@web/lib/base-url';
import { getMcpResourceUrl } from '@web/lib/mcp-request-context';
import {
	consumeAuthorizationTransaction,
	createAuthorizationTransaction,
	unconsumeAuthorizationTransaction,
} from '@web/lib/authorization-transaction';
import {
	handleOauthAuthorizationMetadataGet as handleLibraryOauthAuthorizationMetadataGet,
	handleOauthProtectedResourceMetadataGet as handleLibraryOauthProtectedResourceMetadataGet,
	handleOauthProtectedResourceMcpMetadataGet as handleLibraryOauthProtectedResourceMcpMetadataGet,
	handleOauthRegisterPost as handleLibraryOauthRegisterPost,
	handleOauthRevokePost as handleLibraryOauthRevokePost,
	handleOauthTokenPost as handleLibraryOauthTokenPost,
	isValidClientName,
	type OAuthDiscoveryConfiguration,
	type OAuthRequestContext,
} from '@lostgradient/mcp/oauth';
import {
	createOauthStatelessHostSeams,
	toOauthRequestContext,
} from '@web/lib/oauth-stateless-seams';
import {
	fetchClientIdMetadataDocument,
	isClientIdMetadataDocumentUrl,
} from '@lostgradient/mcp/oauth/client-metadata-documents';
import { isTrustedRequestOrigin } from '@web/lib/csrf-protection';
import { hashCredential } from '@web/lib/hash-credential';
import { createStaticHtmlResponse } from '@web/lib/html-response';
import { jsonResponse, redirectResponse } from '@web/lib/http-response';
import { mcpLatestProtocolVersion } from '@web/lib/mcp-protocol-constants';
import { createRateLimitedResponse } from '@lostgradient/mcp/rate-limit';
import { enforceOauthAuthorizeRateLimit } from '@web/lib/request-rate-limiter';
import type { RequestContext } from '@web/lib/request-context';
import { redirectUriMatchesRegistered } from '@web/lib/redirect-uri-matching';
import { isValidRedirectUri } from '@lostgradient/mcp/oauth';
import OauthAuthorizePage from '@web/views/oauth-authorize-page.svelte';
import { PayloadTooLargeError, readBoundedFormUrlEncoded } from '@web/lib/bounded-request-body';
import { isExactContentType } from '@lostgradient/mcp/oauth';
import { isValidPkceCodeChallenge } from '@lostgradient/mcp/oauth';
import { canonicalizeScopes, parseRequestedScope, splitScopeString } from '@web/lib/oauth-scope';
import { findDuplicateParameterName } from '@web/lib/reject-duplicate-parameters';
import {
	oauthAuthorizeApproveMaxBodyBytes,
	oauthAuthorizeDenyMaxBodyBytes,
	oauthCsrfTokenLength,
	oauthMaxClientIdLength,
	oauthMaxRedirectUriLength,
	oauthMaxResourceLength,
	oauthMaxScopeLength,
	oauthMaxStateLength,
	oauthTransactionIdLength,
} from '@web/lib/request-limits';

function getSearchParamString(searchParams: URLSearchParams, key: string): string | null {
	return searchParams.get(key);
}

function buildOauthSignInRedirectPath(requestUrl: URL): string {
	const callbackPath = `${requestUrl.pathname}${requestUrl.search}`;
	return `/auth/google/start?callback_path=${encodeURIComponent(callbackPath)}`;
}

/**
 * RFC 6749 §4.1.2.1: once `client_id` and `redirect_uri` are both verified
 * against a registered client, every subsequent authorization error
 * (invalid_scope, unauthorized_client, ...) MUST be delivered back to the
 * client through that verified redirect URI rather than rendered as a
 * local page — an error page here leaves the client's flow hanging with no
 * response it can ever see. Errors discovered before the client/redirect
 * URI are verified (unknown client, unregistered redirect URI, and the
 * presence checks that precede them) correctly stay local pages: RFC
 * 6749 explicitly forbids redirecting to an unverified URI.
 */
function authorizeProtocolErrorRedirect(input: {
	redirectUri: string;
	error: string;
	errorDescription: string;
	state: string;
	issuer: string;
}): Response {
	const redirectUrl = new URL(input.redirectUri);
	redirectUrl.searchParams.set('error', input.error);
	redirectUrl.searchParams.set('error_description', input.errorDescription);
	if (input.state) {
		redirectUrl.searchParams.set('state', input.state);
	}
	// RFC 9207 §2.4: applies to error responses too, matching the approve
	// and deny handlers below.
	redirectUrl.searchParams.set('iss', input.issuer);
	return redirectResponse(redirectUrl.toString(), 302);
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
			component: OauthAuthorizePage,
			props: { mode: 'error', error: `Duplicate OAuth parameter: ${duplicateParameterName}.` },
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

	if (!clientId || !redirectUri || !codeChallenge) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			component: OauthAuthorizePage,
			props: { mode: 'error', error: 'Invalid OAuth parameters. Missing required fields.' },
		});
	}

	// Review finding (P2): the parameter-length bound must be enforced
	// before ANY client lookup — including the CIMD branch below, which
	// performs an outbound DNS/HTTPS fetch and can upsert a row into
	// `oauth_clients` for whatever `client_id` it is handed. Checking
	// length only after that lookup let an oversized CIMD-shaped
	// `client_id` reach the network and the database before ever being
	// rejected. This must stay ahead of every redirect added below it too
	// (see the RFC 6749 §4.1.2.1 note there) so a redirect never bypasses
	// this cap either.
	if (
		clientId.length > oauthMaxClientIdLength ||
		redirectUri.length > oauthMaxRedirectUriLength ||
		state.length > oauthMaxStateLength ||
		// `resource` is not yet known to be present at this point — that
		// check runs later, after client/redirect_uri verification, so it
		// can be delivered through the verified redirect per RFC 6749
		// §4.1.2.1. A missing `resource` is not a length violation.
		(resource && resource.length > oauthMaxResourceLength) ||
		(rawScope && rawScope.length > oauthMaxScopeLength)
	) {
		return createStaticHtmlResponse({
			metadata: { title: 'OAuth Authorize' },
			status: 400,
			component: OauthAuthorizePage,
			props: { mode: 'error', error: 'A parameter exceeded its maximum length.' },
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
	//
	// Review finding (P2): client lookup and redirect_uri validation moved
	// here, ahead of every other check, so `client_id`/`redirect_uri` are
	// verified before any later protocol error (scope, response_types,
	// grant_types, ...) decides whether it is allowed to redirect back to
	// the client per RFC 6749 §4.1.2.1 — see `authorizeProtocolErrorRedirect`.
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
			component: OauthAuthorizePage,
			props: { mode: 'error', error: 'Unknown OAuth client.' },
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
			component: OauthAuthorizePage,
			props: { mode: 'error', error: 'Invalid redirect URI.' },
		});
	}

	const issuer = getBaseUrl(context.request);

	// OAUTH-001 / RFC 8707: this server has exactly one protected resource
	// (the MCP endpoint), so `resource` must be present and must name it
	// exactly — never inferred from what the client happened to ask for.
	// Rejecting a missing or mismatched value here, before any transaction
	// is created, is what makes every authorization code (and everything
	// minted from it) provably scoped to this resource rather than merely
	// labeled with it after the fact.
	//
	// Review finding (P2): `client_id` and `redirect_uri` are already
	// verified above (client lookup and registered-redirect-URI match) and
	// `state` is already bounded (the length-cap check earlier in this
	// handler, which this check must stay after — see that check's own
	// comment), so — same RFC 6749 §4.1.2.1 rule the scope, PKCE,
	// response_types, and grant_types checks below all follow —  a missing
	// or mismatched `resource` is delivered back to the client through the
	// verified redirect rather than a local error page. Rendering locally
	// left the client waiting on a callback it would never receive.
	// `invalid_target` is RFC 8707 §2's error code for exactly this case.
	if (!resource || resource !== getMcpResourceUrl(context.request)) {
		return authorizeProtocolErrorRedirect({
			redirectUri,
			error: 'invalid_target',
			errorDescription:
				"Missing or unsupported resource parameter. resource must exactly match this server's MCP resource URL.",
			state,
			issuer,
		});
	}

	// RFC 6749 §4.1.2.1: `client_id` and `redirect_uri` are now verified
	// (client lookup and registered-redirect-URI match above) and `state`
	// is now bounded (the length-cap check earlier in this handler), so an
	// unsupported `response_type` is delivered back to the client through
	// that verified redirect rather than a local error page — the same
	// rule the scope, response_types, and grant_types checks below already
	// follow. This must run AFTER the length-cap check, not before it:
	// `authorizeProtocolErrorRedirect` echoes `state` unbounded into the
	// `Location` header, and running it before the cap would let an
	// oversized `state` bypass SEC-004's bound on that parameter. Before
	// this point (missing `client_id`/`redirect_uri`, an unknown client, an
	// unregistered redirect URI, or an oversized parameter) the client is
	// intentionally NOT redirected: RFC 6749 §4.1.2.1 only allows returning
	// the error to the client if the redirect URI itself is verified, and
	// redirecting on an unverified URI would let an attacker use this
	// endpoint as an open redirector.
	if (responseType !== 'code') {
		return authorizeProtocolErrorRedirect({
			redirectUri,
			error: 'unsupported_response_type',
			errorDescription: 'Only the "code" response type is supported.',
			state,
			issuer,
		});
	}

	// AUTHZ-001 / RFC 6749 §3.3: an unrecognized scope token is rejected
	// outright, before any transaction is created. `client_id` and
	// `redirect_uri` are already verified above, so per RFC 6749 §4.1.2.1
	// this is delivered back to the client through that verified redirect
	// rather than a local error page — review finding (P2): it previously
	// rendered locally, leaving the client waiting on a callback it would
	// never receive.
	const scopeRequest = parseRequestedScope(rawScope);
	if (!scopeRequest.ok) {
		return authorizeProtocolErrorRedirect({
			redirectUri,
			error: 'invalid_scope',
			errorDescription:
				scopeRequest.unknownScopes.length > 0
					? `Unsupported scope: ${scopeRequest.unknownScopes.join(', ')}.`
					: 'The scope parameter must not be empty.',
			state,
			issuer,
		});
	}
	const grantedScope = canonicalizeScopes(scopeRequest.scopes);

	// Review finding (P2): `client_id` and `redirect_uri` are already
	// verified above (client lookup and registered-redirect-URI match) and
	// `state` is already bounded (the length-cap check earlier in this
	// handler), so — same RFC 6749 §4.1.2.1 rule as the scope,
	// response_types, and grant_types checks above — an unsupported or
	// malformed PKCE parameter must be delivered back to the client
	// through the verified redirect rather than rendered as a local 400.
	// Rendering locally left the client waiting on a callback it would
	// never receive. This still runs after the length-cap check, not
	// before it, for the same reason those checks do.
	if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
		return authorizeProtocolErrorRedirect({
			redirectUri,
			error: 'invalid_request',
			errorDescription: 'Only S256 code challenge method is supported.',
			state,
			issuer,
		});
	}

	if (!isValidPkceCodeChallenge(codeChallenge)) {
		return authorizeProtocolErrorRedirect({
			redirectUri,
			error: 'invalid_request',
			errorDescription: 'Malformed code_challenge.',
			state,
			issuer,
		});
	}

	// RFC 7591 §2 / RFC 6749 §3.1.1: a client's `response_types` at
	// registration is the set it is authorized to request here. Both DCR
	// (`oauthRegistrationSchema`) and CIMD (`client-metadata-documents.ts`)
	// only default to `['code']` when the field is omitted entirely — a
	// client that explicitly registered `response_types: []` (or any array
	// that excludes `code`) has told this server it is not authorized to use
	// the `code` response type, even though `responseType !== 'code'` was
	// already rejected above. Enforce that before a consent transaction (and
	// therefore before any code could ever be issued) rather than trusting
	// the client's own name for what it stores. Same RFC 6749 §4.1.2.1
	// redirect rule as the scope check above — `unauthorized_client` is a
	// standard error code delivered through the verified redirect.
	if (!client.responseTypes.includes('code')) {
		return authorizeProtocolErrorRedirect({
			redirectUri,
			error: 'unauthorized_client',
			errorDescription: 'This client is not registered for the code response type.',
			state,
			issuer,
		});
	}

	// Round-7 review follow-up: a client can be internally inconsistent —
	// `response_types: ['code']` (checked above) alongside `grant_types`
	// that omit `authorization_code` (CIMD's own default includes it, but
	// a document can explicitly declare `grant_types: []` or
	// `['refresh_token']` only). The check above would still let this
	// request create a consent transaction and issue a code that the token
	// endpoint's own `client.grantTypes.includes('authorization_code')`
	// check (below, in the token handler) is guaranteed to then reject —
	// the user completes consent for a code the client can never redeem.
	// Reject before creating the transaction instead, through the verified
	// redirect (RFC 6749 §4.1.2.1), same as the two checks above.
	if (!client.grantTypes.includes('authorization_code')) {
		return authorizeProtocolErrorRedirect({
			redirectUri,
			error: 'unauthorized_client',
			errorDescription: 'This client is not registered for the authorization_code grant type.',
			state,
			issuer,
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
		issuer,
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
		component: OauthAuthorizePage,
		props: {
			mode: 'form',
			clientName: displayClientName,
			redirectUri: redirectUri,
			transactionId: transaction.transactionId,
			csrfToken: transaction.csrfToken,
			user: context.user,
			scopes: splitScopeString(grantedScope).map((scope) => ({
				scope,
				description: isMcpScope(scope) ? mcpScopeDescriptions[scope] : scope,
			})),
		},
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
	return handleLibraryOauthRegisterPost(
		toOauthRequestContext(context),
		createOauthStatelessHostSeams(context.request),
	);
}

export async function handleOauthRevokePost(context: RequestContext): Promise<Response> {
	return handleLibraryOauthRevokePost(
		toOauthRequestContext(context),
		createOauthStatelessHostSeams(context.request),
	);
}

export async function handleOauthTokenPost(context: RequestContext): Promise<Response> {
	return handleLibraryOauthTokenPost(
		toOauthRequestContext(context),
		createOauthStatelessHostSeams(context.request),
	);
}

export async function handleOauthAuthorizationMetadataGet(
	context: RequestContext,
): Promise<Response> {
	return handleLibraryOauthAuthorizationMetadataGet(
		toOauthDiscoveryContext(context),
		getOauthDiscoveryConfiguration(context.request),
		templateRegistry,
	);
}

export async function handleOauthProtectedResourceMetadataGet(
	context: RequestContext,
): Promise<Response> {
	return handleLibraryOauthProtectedResourceMetadataGet(
		toOauthDiscoveryContext(context),
		getOauthDiscoveryConfiguration(context.request),
		templateRegistry,
	);
}

export async function handleOauthProtectedResourceMcpMetadataGet(
	context: RequestContext,
): Promise<Response> {
	return handleLibraryOauthProtectedResourceMcpMetadataGet(
		toOauthDiscoveryContext(context),
		getOauthDiscoveryConfiguration(context.request),
		templateRegistry,
	);
}

function toOauthDiscoveryContext(context: RequestContext): OAuthRequestContext {
	return {
		request: context.request,
		requestUrl: context.requestUrl,
		requestId: context.requestId,
		socketAddress: context.clientAddress,
		identity: null,
	};
}

function getOauthDiscoveryConfiguration(request: Request): OAuthDiscoveryConfiguration {
	const publicUrl = new URL(getBaseUrl(request));
	return {
		issuer: getBaseUrl(request),
		baseUrl: publicUrl,
		resource: new URL(getMcpResourceUrl(request)),
		serverName: getMcpEnvironment().MCP_SERVER_NAME,
		mcpProtocolVersion: mcpLatestProtocolVersion,
		mcpUiExtension: { enabled: environment.mcpEnableUiExtension },
		serviceDocumentation: new URL('/support', publicUrl),
		privacyPolicy: new URL('/privacy', publicUrl),
		termsOfService: new URL('/terms', publicUrl),
	};
}
