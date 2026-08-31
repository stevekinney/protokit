import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';

import { defineScopes } from '../scope-vocabulary.js';
import { defineOAuthScopeConfiguration } from '../oauth-scope-configuration.js';
import {
	authenticateOauthClient,
	constantTimeEquals,
	handleOauthRegisterPost,
	handleOauthRevokePost,
	handleOauthTokenPost,
	type OAuthConfiguration,
	type OAuthRequestContext,
	type OAuthStatelessHostSeams,
} from './index.js';
import { createInMemoryOAuthStores } from './testing/index.js';

const hashCredential = (value: string) => createHash('sha256').update(value).digest('hex');
const resource = 'https://example.com/mcp';
const vocabulary = defineScopes({ read: 'Read data.', write: 'Write data.' });
const scopes = defineOAuthScopeConfiguration({ vocabulary, supportedScopes: ['read', 'write'] });

function configuration(): OAuthConfiguration {
	return {
		issuer: 'https://issuer.example.com',
		baseUrl: new URL('https://example.com'),
		resource: new URL(resource),
		accessTokenTtlSeconds: 3600,
		refreshTokenTtlSeconds: 86_400,
		clientSecretTtlSeconds: 7200,
		isTrustedOrigin: () => true,
		trustedProxy: { trustedProxyCidrs: [], trustedProxyHeader: undefined, trustedProxyHopCount: 0 },
		rateLimits: {
			maximumConcurrent: 25,
			categories: {
				oauth_authorize: { maximumRequests: 100, windowSeconds: 60 },
				oauth_register: { maximumRequests: 100, windowSeconds: 60 },
				oauth_token_network: { maximumRequests: 100, windowSeconds: 60 },
				oauth_token_client: { maximumRequests: 100, windowSeconds: 60 },
				oauth_revoke: { maximumRequests: 100, windowSeconds: 60 },
				mcp_network: { maximumRequests: 100, windowSeconds: 60 },
				mcp_user: { maximumRequests: 100, windowSeconds: 60 },
				failed_authentication: { maximumRequests: 100, windowSeconds: 60 },
			},
		},
		mcpUiExtension: { enabled: false },
	};
}

function seams(): OAuthStatelessHostSeams<'read' | 'write'> {
	return {
		stores: createInMemoryOAuthStores(),
		scopes,
		configuration: configuration(),
		hashCredential,
	};
}

function context(
	path: string,
	body: URLSearchParams | object,
	contentType?: string,
): OAuthRequestContext {
	const isForm = body instanceof URLSearchParams;
	const request = new Request(`https://example.com${path}`, {
		method: 'POST',
		headers: {
			'content-type':
				contentType ?? (isForm ? 'application/x-www-form-urlencoded' : 'application/json'),
		},
		body: isForm ? body : JSON.stringify(body),
	});
	return {
		request,
		requestUrl: new URL(request.url),
		requestId: crypto.randomUUID(),
		socketAddress: '127.0.0.1',
		identity: null,
	};
}

async function registerClient(
	host: OAuthStatelessHostSeams<'read' | 'write'>,
	method: 'client_secret_post' | 'none' = 'client_secret_post',
) {
	const response = await handleOauthRegisterPost(
		context('/oauth/register', {
			client_name: 'Test Client',
			redirect_uris: ['https://client.example.com/callback'],
			token_endpoint_auth_method: method,
		}),
		host,
	);
	return {
		response,
		body: (await response.json()) as {
			client_id: string;
			client_secret?: string;
			client_secret_expires_at?: number;
		},
	};
}

function tokenRequest(values: Record<string, string>): OAuthRequestContext {
	return context('/oauth/token', new URLSearchParams(values));
}

async function seedRefreshFamily(
	host: OAuthStatelessHostSeams<'read' | 'write'>,
	clientId: string,
	secret: string,
) {
	const accessToken = crypto.randomUUID();
	const refreshToken = crypto.randomUUID();
	const now = new Date();
	await host.stores.tokens.issueAuthorizationGrant({
		accessToken: {
			accessTokenHash: hashCredential(accessToken),
			clientId,
			userId: 'user-1',
			scope: 'read write',
			resource,
			expiresAt: new Date(now.getTime() + 3600_000),
			revokedAt: null,
			createdAt: now,
		},
		refreshToken: {
			refreshTokenHash: hashCredential(refreshToken),
			clientId,
			userId: 'user-1',
			scope: 'read write',
			resource,
			accessTokenHash: hashCredential(accessToken),
			familyId: 'family-1',
			expiresAt: new Date(now.getTime() + 86_400_000),
			revokedAt: null,
			createdAt: now,
		},
	});
	return { accessToken, refreshToken, clientId, secret };
}

describe('stateless OAuth endpoints', () => {
	test('registers confidential and public clients without a rate-limit store', async () => {
		const host = seams();
		const confidential = await registerClient(host);
		expect(confidential.response.status).toBe(201);
		expect(confidential.body.client_secret).toBeString();
		expect(confidential.body.client_secret_expires_at).toBeGreaterThan(
			Math.floor(Date.now() / 1000),
		);
		const stored = await host.stores.clients.findById(confidential.body.client_id);
		expect(stored?.clientSecretExpiresAt).not.toBeNull();

		const publicClient = await registerClient(host, 'none');
		expect(publicClient.body.client_secret).toBeUndefined();
		expect(
			(await host.stores.clients.findById(publicClient.body.client_id))?.clientSecretHash,
		).toBeNull();
	});

	test('uses one authentication choke point and rejects wrong, expired, and forbidden secrets', async () => {
		const host = seams();
		const confidential = await registerClient(host);
		expect(
			(
				await authenticateOauthClient(
					confidential.body.client_id,
					confidential.body.client_secret,
					host,
				)
			).ok,
		).toBe(true);
		expect((await authenticateOauthClient(confidential.body.client_id, 'wrong', host)).ok).toBe(
			false,
		);
		await host.stores.clients.update(confidential.body.client_id, {
			clientSecretExpiresAt: new Date(0),
		});
		expect(
			(
				await authenticateOauthClient(
					confidential.body.client_id,
					confidential.body.client_secret,
					host,
				)
			).ok,
		).toBe(false);
		const publicClient = await registerClient(host, 'none');
		expect(
			(await authenticateOauthClient(publicClient.body.client_id, 'unexpected', host)).ok,
		).toBe(false);
		expect(constantTimeEquals('same', 'same')).toBe(true);
		expect(constantTimeEquals('short', 'longer')).toBe(false);
	});

	test('exchanges an authorization code only with matching PKCE and resource', async () => {
		const host = seams();
		const client = await registerClient(host);
		const verifier = 'a'.repeat(43);
		const challenge = createHash('sha256').update(verifier).digest('base64url');
		await host.stores.codes.issue({
			codeHash: hashCredential('code'),
			clientId: client.body.client_id,
			userId: 'user-1',
			redirectUri: 'https://client.example.com/callback',
			codeChallenge: challenge,
			codeChallengeMethod: 'S256',
			scope: 'read',
			state: null,
			resource,
			expiresAt: new Date(Date.now() + 60_000),
			usedAt: null,
			createdAt: new Date(),
		});

		const mismatch = await handleOauthTokenPost(
			tokenRequest({
				grant_type: 'authorization_code',
				code: 'code',
				redirect_uri: 'https://client.example.com/callback',
				client_id: client.body.client_id,
				client_secret: client.body.client_secret!,
				code_verifier: 'b'.repeat(43),
				resource,
			}),
			host,
		);
		expect(mismatch.status).toBe(400);
		expect((await mismatch.json()).error).toBe('invalid_grant');

		const wrongResource = await handleOauthTokenPost(
			tokenRequest({
				grant_type: 'authorization_code',
				code: 'code',
				redirect_uri: 'https://client.example.com/callback',
				client_id: client.body.client_id,
				client_secret: client.body.client_secret!,
				code_verifier: verifier,
				resource: 'https://other.example.com/mcp',
			}),
			host,
		);
		expect((await wrongResource.json()).error).toBe('invalid_target');

		const success = await handleOauthTokenPost(
			tokenRequest({
				grant_type: 'authorization_code',
				code: 'code',
				redirect_uri: 'https://client.example.com/callback',
				client_id: client.body.client_id,
				client_secret: client.body.client_secret!,
				code_verifier: verifier,
				resource,
			}),
			host,
		);
		expect(success.status).toBe(200);
		const body = (await success.json()) as { access_token: string; refresh_token: string };
		expect((await host.stores.tokens.findByHash(hashCredential(body.access_token)))?.resource).toBe(
			resource,
		);
		expect(body.refresh_token).toBeString();
	});

	test('allows at most one concurrent refresh', async () => {
		const host = seams();
		const client = await registerClient(host);
		const seeded = await seedRefreshFamily(host, client.body.client_id, client.body.client_secret!);
		const request = () =>
			handleOauthTokenPost(
				tokenRequest({
					grant_type: 'refresh_token',
					refresh_token: seeded.refreshToken,
					client_id: seeded.clientId,
					client_secret: seeded.secret,
					resource,
				}),
				host,
			);
		const responses = await Promise.all([request(), request()]);
		expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
	});

	test('concurrent refresh replay revokes the winning replacement', async () => {
		const host = seams();
		const client = await registerClient(host);
		const seeded = await seedRefreshFamily(host, client.body.client_id, client.body.client_secret!);
		const request = () =>
			handleOauthTokenPost(
				tokenRequest({
					grant_type: 'refresh_token',
					refresh_token: seeded.refreshToken,
					client_id: seeded.clientId,
					client_secret: seeded.secret,
					resource,
				}),
				host,
			);
		const responses = await Promise.all([request(), request()]);
		const winner = responses.find((response) => response.status === 200)!;
		const winnerBody = (await winner.json()) as { access_token: string; refresh_token: string };
		expect(
			(await host.stores.tokens.findByHash(hashCredential(winnerBody.access_token)))?.revokedAt,
		).not.toBeNull();
		const descendant = await handleOauthTokenPost(
			tokenRequest({
				grant_type: 'refresh_token',
				refresh_token: winnerBody.refresh_token,
				client_id: seeded.clientId,
				client_secret: seeded.secret,
				resource,
			}),
			host,
		);
		expect(descendant.status).toBe(400);
	});

	test('ancestor replay revokes an orphaned ancestor access token', async () => {
		const host = seams();
		const client = await registerClient(host);
		const accessToken = crypto.randomUUID();
		const refreshToken = crypto.randomUUID();
		const now = new Date();
		await host.stores.tokens.issueAuthorizationGrant({
			accessToken: {
				accessTokenHash: hashCredential(accessToken),
				clientId: client.body.client_id,
				userId: 'user-1',
				scope: 'read',
				resource,
				expiresAt: new Date(now.getTime() + 3600_000),
				revokedAt: null,
				createdAt: now,
			},
			refreshToken: {
				refreshTokenHash: hashCredential(refreshToken),
				clientId: client.body.client_id,
				userId: 'user-1',
				scope: 'read',
				resource,
				accessTokenHash: hashCredential(accessToken),
				familyId: 'orphaned-family',
				expiresAt: new Date(now.getTime() + 86_400_000),
				revokedAt: now,
				createdAt: now,
			},
		});

		const replay = await handleOauthTokenPost(
			tokenRequest({
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
				client_id: client.body.client_id,
				client_secret: client.body.client_secret!,
				resource,
			}),
			host,
		);
		expect(replay.status).toBe(400);
		expect(
			(await host.stores.tokens.findByHash(hashCredential(accessToken)))?.revokedAt,
		).not.toBeNull();
	});

	test('refresh replay survives cleanup between rotation and replay', async () => {
		const host = seams();
		const client = await registerClient(host);
		const seeded = await seedRefreshFamily(host, client.body.client_id, client.body.client_secret!);
		const first = await handleOauthTokenPost(
			tokenRequest({
				grant_type: 'refresh_token',
				refresh_token: seeded.refreshToken,
				client_id: seeded.clientId,
				client_secret: seeded.secret,
				resource,
			}),
			host,
		);
		const replacement = (await first.json()) as { access_token: string; refresh_token: string };
		await host.stores.tokens.purgeExpired(new Date());
		const replay = await handleOauthTokenPost(
			tokenRequest({
				grant_type: 'refresh_token',
				refresh_token: seeded.refreshToken,
				client_id: seeded.clientId,
				client_secret: seeded.secret,
				resource,
			}),
			host,
		);
		expect(replay.status).toBe(400);
		expect(
			(await host.stores.tokens.findByHash(hashCredential(replacement.access_token)))?.revokedAt,
		).not.toBeNull();
	});

	test('revokes either token kind regardless of a wrong hint and binds mutation to the client', async () => {
		const host = seams();
		const client = await registerClient(host);
		const other = await registerClient(host);
		const seeded = await seedRefreshFamily(host, client.body.client_id, client.body.client_secret!);
		const crossClient = await handleOauthRevokePost(
			context(
				'/oauth/revoke',
				new URLSearchParams({
					token: seeded.refreshToken,
					token_type_hint: 'access_token',
					client_id: other.body.client_id,
					client_secret: other.body.client_secret!,
				}),
			),
			host,
		);
		expect(crossClient.status).toBe(200);
		const stillWorks = await handleOauthTokenPost(
			tokenRequest({
				grant_type: 'refresh_token',
				refresh_token: seeded.refreshToken,
				client_id: seeded.clientId,
				client_secret: seeded.secret,
				resource,
			}),
			host,
		);
		expect(stillWorks.status).toBe(200);
		const replacement = (await stillWorks.json()) as {
			refresh_token: string;
			access_token: string;
		};
		const revoked = await handleOauthRevokePost(
			context(
				'/oauth/revoke',
				new URLSearchParams({
					token: replacement.refresh_token,
					token_type_hint: 'access_token',
					client_id: seeded.clientId,
					client_secret: seeded.secret,
				}),
			),
			host,
		);
		expect(revoked.status).toBe(200);
		expect(
			(await host.stores.tokens.findByHash(hashCredential(replacement.access_token)))?.revokedAt,
		).not.toBeNull();
	});
});
