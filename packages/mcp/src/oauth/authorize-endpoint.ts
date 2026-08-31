import { randomBytes } from 'node:crypto';

import type { OAuthHostSeams, OAuthRequestContext } from './index.js';
import { isClientIdMetadataDocumentUrl } from './client-metadata-documents.js';
import { oauthJson } from './endpoint-responses.js';
import { rateLimitResponse } from './endpoint-rate-limits.js';
import {
	oauthAuthorizeApproveMaximumBodyBytes,
	oauthAuthorizeDenyMaximumBodyBytes,
	PayloadTooLargeError,
	readBoundedText,
} from './request-body.js';
import { redirectUriMatchesRegistered } from './redirect-uri-matching.js';
import { isExactContentType, isValidClientName } from './security-utilities.js';
import { parseRequestedScope, splitScopes } from './scope-utilities.js';
import { isValidPkceCodeChallenge } from './pkce-validation.js';

const authorizationLifetimeMilliseconds = 10 * 60 * 1000;
const maximumClientIdLength = 2_048;
const maximumRedirectUriLength = 2_048;
const maximumStateLength = 512;
const maximumScopeLength = 512;
const maximumResourceLength = 2_048;
const transactionIdLength = 64;
const csrfTokenLength = 64;

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

export const authorizeFormParameterNames = ['transaction_id', 'csrf_token'] as const;

function redirect(location: string, status = 302): Response {
	return new Response(null, {
		status,
		headers: { Location: location, 'Cache-Control': 'no-store' },
	});
}

function protocolErrorRedirect(input: {
	redirectUri: string;
	error: string;
	errorDescription: string;
	state: string;
	issuer: string;
}): Response {
	const url = new URL(input.redirectUri);
	url.searchParams.set('error', input.error);
	url.searchParams.set('error_description', input.errorDescription);
	if (input.state) url.searchParams.set('state', input.state);
	url.searchParams.set('iss', input.issuer);
	return redirect(url.toString());
}

function duplicateParameter(
	parameters: URLSearchParams,
	names: readonly string[],
): string | undefined {
	return names.find((name) => parameters.getAll(name).length > 1);
}

async function readAuthorizeForm(request: Request, maximumBytes: number): Promise<URLSearchParams> {
	if (!isExactContentType(request.headers.get('content-type'), 'application/x-www-form-urlencoded'))
		throw new Error('unsupported_content_type');
	return new URLSearchParams(await readBoundedText(request, maximumBytes));
}

function formError(error: unknown): Response {
	if (error instanceof PayloadTooLargeError)
		return oauthJson({ error: 'invalid_request', message: 'Request body too large.' }, 413);
	if (error instanceof Error && error.message === 'unsupported_content_type')
		return oauthJson({ error: 'unsupported_content_type' }, 400);
	return oauthJson({ error: 'invalid_request', message: 'Request body is not valid UTF-8.' }, 400);
}

async function resolveIdentity<Scope extends string>(
	context: OAuthRequestContext,
	seams: OAuthHostSeams<Scope>,
) {
	return context.identity ?? seams.resolveIdentityBinding(context.request);
}

function isAuthorizationServerOrigin(origin: string, baseUrl: URL): boolean {
	try {
		return new URL(origin).origin === baseUrl.origin;
	} catch {
		return false;
	}
}

export async function handleOauthAuthorizeGet<Scope extends string>(
	context: OAuthRequestContext,
	seams: OAuthHostSeams<Scope>,
): Promise<Response> {
	const limited = await rateLimitResponse({ context, seams, category: 'oauth_authorize' });
	if (limited) return limited;
	const identity = await resolveIdentity(context, seams);
	if (!identity) return seams.handleUnauthenticatedAuthorization(context.request);

	const duplicate = duplicateParameter(context.requestUrl.searchParams, authorizeParameterNames);
	if (duplicate)
		return seams.renderConsent({
			mode: 'error',
			error: `Duplicate OAuth parameter: ${duplicate}.`,
		});

	const clientId = context.requestUrl.searchParams.get('client_id');
	const redirectUri = context.requestUrl.searchParams.get('redirect_uri');
	const responseType = context.requestUrl.searchParams.get('response_type');
	const codeChallenge = context.requestUrl.searchParams.get('code_challenge');
	const codeChallengeMethod = context.requestUrl.searchParams.get('code_challenge_method');
	const state = context.requestUrl.searchParams.get('state') || '';
	const resource = context.requestUrl.searchParams.get('resource');
	const rawScope = context.requestUrl.searchParams.get('scope');
	if (!clientId || !redirectUri || !codeChallenge)
		return seams.renderConsent({
			mode: 'error',
			error: 'Invalid OAuth parameters. Missing required fields.',
		});
	if (
		clientId.length > maximumClientIdLength ||
		redirectUri.length > maximumRedirectUriLength ||
		state.length > maximumStateLength ||
		(resource !== null && resource.length > maximumResourceLength) ||
		(rawScope !== null && rawScope.length > maximumScopeLength)
	)
		return seams.renderConsent({
			mode: 'error',
			error: 'A parameter exceeded its maximum length.',
		});

	let client = null;
	if (isClientIdMetadataDocumentUrl(clientId)) {
		const document = await seams.fetchClientIdMetadataDocument(clientId);
		if (document) {
			const now = new Date();
			client = {
				clientId: document.clientId,
				clientSecretHash: null,
				clientSecretExpiresAt: null,
				clientName: document.clientName,
				clientType: 'public',
				tokenEndpointAuthMethod: 'none',
				applicationType: document.applicationType ?? null,
				redirectUris: document.redirectUris,
				grantTypes: document.grantTypes,
				responseTypes: document.responseTypes,
				clientIdMetadataUrl: document.clientId,
				createdAt: now,
				updatedAt: now,
			};
			await seams.stores.clients.upsert(client);
		}
	} else {
		client = await seams.stores.clients.findById(clientId);
	}
	if (!client) return seams.renderConsent({ mode: 'error', error: 'Unknown OAuth client.' });
	if (!redirectUriMatchesRegistered(redirectUri, client.redirectUris))
		return seams.renderConsent({ mode: 'error', error: 'Invalid redirect URI.' });

	const issuer = seams.configuration.issuer;
	if (!resource || resource !== seams.configuration.resource.href)
		return protocolErrorRedirect({
			redirectUri,
			error: 'invalid_target',
			errorDescription:
				"Missing or unsupported resource parameter. resource must exactly match this server's MCP resource URL.",
			state,
			issuer,
		});
	if (responseType !== 'code')
		return protocolErrorRedirect({
			redirectUri,
			error: 'unsupported_response_type',
			errorDescription: 'Only the "code" response type is supported.',
			state,
			issuer,
		});

	const requestedScope = parseRequestedScope(rawScope, seams.scopes.supportedScopes);
	if (!requestedScope.ok)
		return protocolErrorRedirect({
			redirectUri,
			error: 'invalid_scope',
			errorDescription:
				requestedScope.unknownScopes.length > 0
					? `Unsupported scope: ${requestedScope.unknownScopes.join(', ')}.`
					: 'The scope parameter must not be empty.',
			state,
			issuer,
		});
	if (codeChallengeMethod && codeChallengeMethod !== 'S256')
		return protocolErrorRedirect({
			redirectUri,
			error: 'invalid_request',
			errorDescription: 'Only S256 code challenge method is supported.',
			state,
			issuer,
		});
	if (!isValidPkceCodeChallenge(codeChallenge))
		return protocolErrorRedirect({
			redirectUri,
			error: 'invalid_request',
			errorDescription: 'Malformed code_challenge.',
			state,
			issuer,
		});
	if (!client.responseTypes.includes('code'))
		return protocolErrorRedirect({
			redirectUri,
			error: 'unauthorized_client',
			errorDescription: 'This client is not registered for the code response type.',
			state,
			issuer,
		});
	if (!client.grantTypes.includes('authorization_code'))
		return protocolErrorRedirect({
			redirectUri,
			error: 'unauthorized_client',
			errorDescription: 'This client is not registered for the authorization_code grant type.',
			state,
			issuer,
		});

	const transactionId = randomBytes(32).toString('hex');
	const csrfToken = randomBytes(32).toString('hex');
	const now = new Date();
	await seams.stores.transactions.create({
		transactionId,
		csrfToken,
		consentBinding: identity.consentBinding,
		record: {
			userId: identity.subjectId,
			clientId,
			redirectUri,
			codeChallenge,
			codeChallengeMethod: codeChallengeMethod || 'S256',
			state: state || null,
			issuer,
			resource,
			scope: requestedScope.scope,
			expiresAt: new Date(now.getTime() + authorizationLifetimeMilliseconds),
			consumedAt: null,
			createdAt: now,
		},
	});
	const clientName = isValidClientName(client.clientName)
		? client.clientName
		: 'the requesting application';
	const requester = await seams.resolveUserProfile(identity.subjectId);
	if (!requester)
		return seams.renderConsent({
			mode: 'error',
			error: 'The authenticated account profile could not be resolved.',
		});
	return seams.renderConsent({
		mode: 'prompt',
		transactionId,
		csrfToken,
		redirectUri,
		client: { id: client.clientId, name: clientName },
		requester,
		scopes: splitScopes(requestedScope.scope).map((scope) => ({
			scope,
			description: seams.scopes.vocabulary.descriptions[scope as Scope] ?? scope,
		})),
	});
}

async function consumeForm<Scope extends string>(input: {
	context: OAuthRequestContext;
	seams: OAuthHostSeams<Scope>;
	maximumBytes: number;
}): Promise<
	| {
			transactionId: string;
			transaction: Awaited<ReturnType<typeof input.seams.stores.transactions.consume>>;
			identity: NonNullable<OAuthRequestContext['identity']>;
	  }
	| Response
> {
	const identity = await resolveIdentity(input.context, input.seams);
	if (!identity) return oauthJson({ error: 'unauthorized' }, 401);
	const fetchSite = input.context.request.headers.get('sec-fetch-site')?.toLowerCase();
	const origin = input.context.request.headers.get('origin');
	const trustedRequest =
		fetchSite === 'same-origin' ||
		fetchSite === 'none' ||
		(!fetchSite &&
			origin !== null &&
			isAuthorizationServerOrigin(origin, input.seams.configuration.baseUrl));
	if (!trustedRequest)
		return oauthJson({ error: 'invalid_request', message: 'Cross-site request rejected.' }, 403);
	let parameters: URLSearchParams;
	try {
		parameters = await readAuthorizeForm(input.context.request, input.maximumBytes);
	} catch (error) {
		return formError(error);
	}
	const duplicate = duplicateParameter(parameters, authorizeFormParameterNames);
	if (duplicate)
		return oauthJson(
			{ error: 'invalid_request', message: `Duplicate parameter: ${duplicate}.` },
			400,
		);
	const transactionId = parameters.get('transaction_id');
	const csrfToken = parameters.get('csrf_token');
	if (!transactionId || !csrfToken)
		return oauthJson(
			{ error: 'invalid_request', message: 'Missing transaction_id or csrf_token.' },
			400,
		);
	if (transactionId.length > transactionIdLength || csrfToken.length > csrfTokenLength)
		return oauthJson(
			{ error: 'invalid_request', message: 'A parameter exceeded its maximum length.' },
			400,
		);
	const transaction = await input.seams.stores.transactions.consume(
		transactionId,
		csrfToken,
		identity.consentBinding,
		identity.subjectId,
	);
	if (!transaction)
		return oauthJson(
			{
				error: 'invalid_request',
				message: 'Authorization transaction not found, already used, expired, or invalid.',
			},
			400,
		);
	return { transactionId, transaction, identity };
}

export async function handleOauthAuthorizeApprove<Scope extends string>(
	context: OAuthRequestContext,
	seams: OAuthHostSeams<Scope>,
): Promise<Response> {
	const consumed = await consumeForm({
		context,
		seams,
		maximumBytes: oauthAuthorizeApproveMaximumBodyBytes,
	});
	if (consumed instanceof Response) return consumed;
	const { transactionId, transaction } = consumed;
	if (!transaction) throw new Error('Authorization invariant violated');
	const code = randomBytes(32).toString('hex');
	try {
		await seams.stores.codes.issue({
			codeHash: seams.hashCredential(code),
			clientId: transaction.clientId,
			userId: consumed.identity.subjectId,
			redirectUri: transaction.redirectUri,
			codeChallenge: transaction.codeChallenge,
			codeChallengeMethod: transaction.codeChallengeMethod,
			state: transaction.state,
			resource: transaction.resource,
			scope: transaction.scope,
			expiresAt: new Date(Date.now() + authorizationLifetimeMilliseconds),
			usedAt: null,
			createdAt: new Date(),
		});
	} catch (error) {
		await seams.stores.transactions
			.unconsume(transactionId, transaction.consumedAt)
			.catch(() => false);
		throw error;
	}
	const redirectUrl = new URL(transaction.redirectUri);
	redirectUrl.searchParams.set('code', code);
	if (transaction.state) redirectUrl.searchParams.set('state', transaction.state);
	redirectUrl.searchParams.set('iss', transaction.issuer);
	return redirect(redirectUrl.toString());
}

export async function handleOauthAuthorizeDeny<Scope extends string>(
	context: OAuthRequestContext,
	seams: OAuthHostSeams<Scope>,
): Promise<Response> {
	const consumed = await consumeForm({
		context,
		seams,
		maximumBytes: oauthAuthorizeDenyMaximumBodyBytes,
	});
	if (consumed instanceof Response) return consumed;
	if (!consumed.transaction) throw new Error('Authorization invariant violated');
	seams.recordEvent?.({
		category: 'authorization',
		outcome: 'user_denied',
		attributes: { clientId: consumed.transaction.clientId },
	});
	const redirectUrl = new URL(consumed.transaction.redirectUri);
	redirectUrl.searchParams.set('error', 'access_denied');
	redirectUrl.searchParams.set('error_description', 'The user denied the authorization request.');
	if (consumed.transaction.state) redirectUrl.searchParams.set('state', consumed.transaction.state);
	redirectUrl.searchParams.set('iss', consumed.transaction.issuer);
	return redirect(redirectUrl.toString());
}
