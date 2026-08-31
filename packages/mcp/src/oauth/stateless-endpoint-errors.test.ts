import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';

import { defineOAuthScopeConfiguration } from '../oauth-scope-configuration.js';
import { createInMemorySlidingWindowStore } from '../rate-limit/index.js';
import { defineScopes } from '../scope-vocabulary.js';
import {
	handleOauthRegisterPost,
	handleOauthRevokePost,
	handleOauthTokenPost,
	type OAuthConfiguration,
	type OAuthRequestContext,
	type OAuthStatelessHostSeams,
} from './index.js';
import { createInMemoryOAuthStores } from './testing/index.js';

const resource = 'https://example.com/mcp';
const hashCredential = (value: string) => createHash('sha256').update(value).digest('hex');
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

function host(): OAuthStatelessHostSeams<'read' | 'write'> {
	return {
		stores: createInMemoryOAuthStores(),
		scopes,
		configuration: configuration(),
		hashCredential,
	};
}

function request(path: string, body: string, contentType: string): OAuthRequestContext {
	const webRequest = new Request(`https://example.com${path}`, {
		method: 'POST',
		headers: { 'content-type': contentType },
		body,
	});
	return {
		request: webRequest,
		requestUrl: new URL(webRequest.url),
		requestId: crypto.randomUUID(),
		socketAddress: '127.0.0.1',
		identity: null,
	};
}

function form(path: string, values: Record<string, string>): OAuthRequestContext {
	return request(path, new URLSearchParams(values).toString(), 'application/x-www-form-urlencoded');
}

async function register(oauthHost: OAuthStatelessHostSeams<'read' | 'write'>) {
	const response = await handleOauthRegisterPost(
		request(
			'/oauth/register',
			JSON.stringify({
				client_name: 'Error Branch Client',
				redirect_uris: ['https://client.example.com/callback'],
			}),
			'application/json',
		),
		oauthHost,
	);
	return (await response.json()) as { client_id: string; client_secret: string };
}

describe('stateless OAuth endpoint error contracts', () => {
	test('registration rejects unsupported, malformed, oversized, and invalid metadata bodies', async () => {
		const oauthHost = host();
		const unsupported = await handleOauthRegisterPost(
			request('/oauth/register', '{}', 'text/plain'),
			oauthHost,
		);
		expect(unsupported.status).toBe(400);
		const malformed = await handleOauthRegisterPost(
			request('/oauth/register', '{', 'application/json'),
			oauthHost,
		);
		expect(malformed.status).toBe(400);
		const oversized = await handleOauthRegisterPost(
			request(
				'/oauth/register',
				JSON.stringify({ client_name: 'x'.repeat(20_000) }),
				'application/json',
			),
			oauthHost,
		);
		expect(oversized.status).toBe(413);
		const invalid = await handleOauthRegisterPost(
			request('/oauth/register', JSON.stringify({ redirect_uris: [] }), 'application/json'),
			oauthHost,
		);
		expect(invalid.status).toBe(400);
		const insecureWebRedirect = await handleOauthRegisterPost(
			request(
				'/oauth/register',
				JSON.stringify({
					application_type: 'web',
					redirect_uris: ['http://client.example.com/callback'],
				}),
				'application/json',
			),
			oauthHost,
		);
		expect(insecureWebRedirect.status).toBe(400);
	});

	test('authorization-code exchange rejects every boundary before issuing credentials', async () => {
		const oauthHost = host();
		const client = await register(oauthHost);
		const verifier = 'a'.repeat(43);
		const challenge = createHash('sha256').update(verifier).digest('base64url');
		const base = {
			grant_type: 'authorization_code',
			code: 'code',
			redirect_uri: 'https://client.example.com/callback',
			client_id: client.client_id,
			client_secret: client.client_secret,
			code_verifier: verifier,
			resource,
		};
		expect(
			(
				await handleOauthTokenPost(
					form('/oauth/token', { grant_type: 'authorization_code' }),
					oauthHost,
				)
			).status,
		).toBe(400);
		expect(
			(
				await handleOauthTokenPost(
					form('/oauth/token', { ...base, code: 'x'.repeat(513) }),
					oauthHost,
				)
			).status,
		).toBe(400);
		expect(
			(
				await handleOauthTokenPost(
					form('/oauth/token', { ...base, code_verifier: 'short' }),
					oauthHost,
				)
			).status,
		).toBe(400);
		expect(
			(
				await handleOauthTokenPost(
					form('/oauth/token', { ...base, client_secret: 'wrong' }),
					oauthHost,
				)
			).status,
		).toBe(401);
		expect((await handleOauthTokenPost(form('/oauth/token', base), oauthHost)).status).toBe(400);

		await oauthHost.stores.codes.issue({
			codeHash: hashCredential(base.code),
			clientId: client.client_id,
			userId: 'user-1',
			redirectUri: 'https://different.example.com/callback',
			codeChallenge: challenge,
			codeChallengeMethod: 'S256',
			scope: 'read',
			state: null,
			resource,
			expiresAt: new Date(Date.now() + 60_000),
			usedAt: null,
			createdAt: new Date(),
		});
		expect((await handleOauthTokenPost(form('/oauth/token', base), oauthHost)).status).toBe(400);

		await oauthHost.stores.codes.deleteAllForUser('user-1');
		await oauthHost.stores.codes.issue({
			codeHash: hashCredential(base.code),
			clientId: client.client_id,
			userId: 'user-1',
			redirectUri: base.redirect_uri,
			codeChallenge: challenge,
			codeChallengeMethod: 'S256',
			scope: 'read',
			state: null,
			resource,
			expiresAt: new Date(Date.now() + 60_000),
			usedAt: null,
			createdAt: new Date(),
		});
		oauthHost.stores.codes.consume = () => Promise.resolve(null);
		expect((await handleOauthTokenPost(form('/oauth/token', base), oauthHost)).status).toBe(400);
	});

	test('authorization-code issuance reopens the consumed code before propagating a store failure', async () => {
		const oauthHost = host();
		const client = await register(oauthHost);
		const verifier = 'a'.repeat(43);
		await oauthHost.stores.codes.issue({
			codeHash: hashCredential('failing-code'),
			clientId: client.client_id,
			userId: 'user-1',
			redirectUri: 'https://client.example.com/callback',
			codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
			codeChallengeMethod: 'S256',
			scope: 'read',
			state: null,
			resource,
			expiresAt: new Date(Date.now() + 60_000),
			usedAt: null,
			createdAt: new Date(),
		});
		oauthHost.stores.tokens.issueAuthorizationGrant = () =>
			Promise.reject(new Error('store failed'));
		oauthHost.stores.codes.unconsume = () => Promise.reject(new Error('reopen failed'));
		await expect(
			handleOauthTokenPost(
				form('/oauth/token', {
					grant_type: 'authorization_code',
					code: 'failing-code',
					redirect_uri: 'https://client.example.com/callback',
					client_id: client.client_id,
					client_secret: client.client_secret,
					code_verifier: verifier,
					resource,
				}),
				oauthHost,
			),
		).rejects.toThrow('store failed');
	});

	test('refresh exchange rejects malformed, unauthorized, narrowed, and missing grants', async () => {
		const oauthHost = host();
		const client = await register(oauthHost);
		const base = {
			grant_type: 'refresh_token',
			refresh_token: 'refresh',
			client_id: client.client_id,
			client_secret: client.client_secret,
			resource,
		};
		expect(
			(await handleOauthTokenPost(form('/oauth/token', { grant_type: 'refresh_token' }), oauthHost))
				.status,
		).toBe(400);
		expect(
			(
				await handleOauthTokenPost(
					form('/oauth/token', { ...base, refresh_token: 'x'.repeat(513) }),
					oauthHost,
				)
			).status,
		).toBe(400);
		expect(
			(
				await handleOauthTokenPost(
					form('/oauth/token', { ...base, resource: 'https://wrong.example/mcp' }),
					oauthHost,
				)
			).status,
		).toBe(400);
		expect(
			(await handleOauthTokenPost(form('/oauth/token', { ...base, scope: 'unknown' }), oauthHost))
				.status,
		).toBe(400);
		expect(
			(
				await handleOauthTokenPost(
					form('/oauth/token', { ...base, client_secret: 'wrong' }),
					oauthHost,
				)
			).status,
		).toBe(401);
		expect((await handleOauthTokenPost(form('/oauth/token', base), oauthHost)).status).toBe(400);

		oauthHost.stores.tokens.rotateRefreshToken = () =>
			Promise.resolve({ status: 'scope_rejected' });
		expect(
			(await handleOauthTokenPost(form('/oauth/token', { ...base, scope: 'read' }), oauthHost))
				.status,
		).toBe(400);
	});

	test('token and revocation endpoints reject bad bodies, enforce rate limits, and lock out failures', async () => {
		const oauthHost = host();
		const client = await register(oauthHost);
		expect(
			(await handleOauthTokenPost(request('/oauth/token', '{}', 'application/json'), oauthHost))
				.status,
		).toBe(400);
		expect(
			(await handleOauthRevokePost(request('/oauth/revoke', '{}', 'application/json'), oauthHost))
				.status,
		).toBe(400);
		expect((await handleOauthRevokePost(form('/oauth/revoke', {}), oauthHost)).status).toBe(400);
		expect(
			(
				await handleOauthRevokePost(
					form('/oauth/revoke', { token: 'x'.repeat(513), client_id: client.client_id }),
					oauthHost,
				)
			).status,
		).toBe(400);
		expect(
			(
				await handleOauthRevokePost(
					form('/oauth/revoke', {
						token: 'token',
						client_id: client.client_id,
						client_secret: 'wrong',
					}),
					oauthHost,
				)
			).status,
		).toBe(401);

		oauthHost.configuration.rateLimitStores = { slidingWindow: createInMemorySlidingWindowStore() };
		oauthHost.configuration.rateLimits.categories.oauth_token_network.maximumRequests = 1;
		await handleOauthTokenPost(form('/oauth/token', { grant_type: 'unsupported' }), oauthHost);
		expect(
			(await handleOauthTokenPost(form('/oauth/token', { grant_type: 'unsupported' }), oauthHost))
				.status,
		).toBe(429);

		const revokeHost = host();
		revokeHost.configuration.rateLimitStores = {
			slidingWindow: createInMemorySlidingWindowStore(),
		};
		revokeHost.configuration.rateLimits.categories.oauth_revoke.maximumRequests = 1;
		await handleOauthRevokePost(form('/oauth/revoke', {}), revokeHost);
		expect((await handleOauthRevokePost(form('/oauth/revoke', {}), revokeHost)).status).toBe(429);
	});

	test('token and revocation endpoints stop before parsing after authentication lockout', async () => {
		const tokenHost = host();
		tokenHost.configuration.rateLimitStores = { slidingWindow: createInMemorySlidingWindowStore() };
		tokenHost.configuration.rateLimits.categories.failed_authentication.maximumRequests = 1;
		await handleOauthTokenPost(
			form('/oauth/token', {
				grant_type: 'authorization_code',
				code: 'code',
				redirect_uri: 'https://client.example.com/callback',
				client_id: 'unknown',
				code_verifier: 'a'.repeat(43),
				resource,
			}),
			tokenHost,
		);
		expect((await handleOauthTokenPost(form('/oauth/token', {}), tokenHost)).status).toBe(429);

		const revokeHost = host();
		revokeHost.configuration.rateLimitStores = {
			slidingWindow: createInMemorySlidingWindowStore(),
		};
		revokeHost.configuration.rateLimits.categories.failed_authentication.maximumRequests = 1;
		await handleOauthRevokePost(
			form('/oauth/revoke', { token: 'token', client_id: 'unknown' }),
			revokeHost,
		);
		expect((await handleOauthRevokePost(form('/oauth/revoke', {}), revokeHost)).status).toBe(429);
	});
});
