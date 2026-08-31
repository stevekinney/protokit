import type { RegisteredClient } from './stores.js';
import type { OAuthStatelessHostSeams } from './index.js';
import { constantTimeEquals } from './security-utilities.js';

export type OauthClientAuthenticationResult =
	{ ok: true; client: RegisteredClient } | { ok: false };

/** Sole client-authentication choke point shared by token and revocation endpoints. */
export async function authenticateOauthClient<Scope extends string>(
	clientId: string,
	clientSecret: string | undefined,
	seams: OAuthStatelessHostSeams<Scope>,
): Promise<OauthClientAuthenticationResult> {
	const client = await seams.stores.clients.findById(clientId);
	if (!client) return { ok: false };
	if (client.tokenEndpointAuthMethod === 'client_secret_post') {
		if (!clientSecret || !client.clientSecretHash) return { ok: false };
		if (!constantTimeEquals(client.clientSecretHash, seams.hashCredential(clientSecret)))
			return { ok: false };
		if (client.clientSecretExpiresAt && client.clientSecretExpiresAt.getTime() <= Date.now())
			return { ok: false };
		return { ok: true, client };
	}
	if (client.tokenEndpointAuthMethod === 'none') {
		return clientSecret ? { ok: false } : { ok: true, client };
	}
	return { ok: false };
}
