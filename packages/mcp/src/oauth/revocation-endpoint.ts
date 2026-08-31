import { authenticateOauthClient } from './client-authentication.js';
import { oauthBodyError, oauthNoStoreHeaders, oauthJson } from './endpoint-responses.js';
import {
	isAuthenticationLockedOut,
	rateLimitResponse,
	recordFailedAuthentication,
} from './endpoint-rate-limits.js';
import type { OAuthRequestContext, OAuthStatelessHostSeams } from './index.js';
import { oauthRevokeMaximumBodyBytes, readOauthParameters } from './request-body.js';

export async function handleOauthRevokePost<Scope extends string>(
	context: OAuthRequestContext,
	seams: OAuthStatelessHostSeams<Scope>,
): Promise<Response> {
	if (await isAuthenticationLockedOut(context, seams))
		return oauthJson(
			{ error: 'invalid_client', error_description: 'Too many failed authentication attempts.' },
			429,
		);
	const limited = await rateLimitResponse({ context, seams, category: 'oauth_revoke' });
	if (limited) return limited;
	let body: Record<string, string>;
	try {
		body = await readOauthParameters(context.request, oauthRevokeMaximumBodyBytes);
	} catch (error) {
		return oauthBodyError(error);
	}
	const { token, token_type_hint: hint, client_id: clientId, client_secret: clientSecret } = body;
	if (!token || !clientId)
		return oauthJson(
			{ error: 'invalid_request', error_description: 'Missing token or client_id parameter' },
			400,
		);
	if (token.length > 512 || clientId.length > 2048)
		return oauthJson(
			{ error: 'invalid_request', error_description: 'A parameter exceeded its maximum length' },
			400,
		);
	const authentication = await authenticateOauthClient(clientId, clientSecret, seams);
	if (!authentication.ok) {
		seams.recordEvent?.({
			category: 'client_authentication',
			outcome: 'invalid_client',
			attributes: { clientId },
		});
		await recordFailedAuthentication(context, seams);
		return oauthJson({ error: 'invalid_client' }, 401);
	}
	const tokenHash = seams.hashCredential(token);
	let subjectId: string | undefined;
	let outcome = 'not_found_or_already_revoked';
	const revokeRefresh = async (): Promise<boolean> => {
		const result = await seams.stores.tokens.revokeRefreshToken(tokenHash, clientId);
		if (result.status === 'invalid') return false;
		subjectId = result.userId;
		outcome = result.status === 'replay_revoked' ? 'replay_detected' : 'refresh_token_revoked';
		return true;
	};
	const revokeAccess = async (): Promise<boolean> => {
		const revoked = await seams.stores.tokens.revokeAccessToken(tokenHash, clientId);
		if (revoked) outcome = 'access_token_revoked';
		return revoked;
	};
	const attempts =
		hint === 'refresh_token' ? [revokeRefresh, revokeAccess] : [revokeAccess, revokeRefresh];
	for (const attempt of attempts) {
		if (await attempt()) break;
	}
	seams.recordEvent?.({ category: 'revocation', outcome, attributes: { clientId } });
	if (subjectId) await seams.publishGrantRevocation?.(subjectId);
	return new Response(null, { status: 200, headers: oauthNoStoreHeaders });
}
