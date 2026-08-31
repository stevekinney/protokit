import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, test } from 'bun:test';

import { defineScopes } from '../scope-vocabulary.js';
import { defineOAuthScopeConfiguration } from '../oauth-scope-configuration.js';
import {
	authorizeFormParameterNames,
	handleOauthAuthorizeApprove,
	handleOauthAuthorizeDeny,
	handleOauthAuthorizeGet,
	type ConsentPresentation,
	type OAuthHostSeams,
	type OAuthRequestContext,
} from './index.js';
import { createInMemoryOAuthStores } from './testing/index.js';
import { redirectUriMatchesRegistered } from './redirect-uri-matching.js';

const issuer = 'https://issuer.example.com';
const resource = 'https://issuer.example.com/mcp';
const redirectUri = 'https://client.example.com/callback';
const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const hashCredential = (value: string) => createHash('sha256').update(value).digest('hex');
const vocabulary = defineScopes({
	read: 'Read data.',
	write: 'Write data.',
	custom: 'Custom access.',
});
const scopes = defineOAuthScopeConfiguration({
	vocabulary,
	supportedScopes: ['read', 'write', 'custom'],
});

let presentations: ConsentPresentation[];
let seams: OAuthHostSeams<'read' | 'write' | 'custom'>;
let recordedEvents: Parameters<NonNullable<OAuthHostSeams<string>['recordEvent']>>[0][];

function context(url: string, request?: Request): OAuthRequestContext {
	return {
		request: request ?? new Request(url),
		requestUrl: new URL(url),
		requestId: crypto.randomUUID(),
		socketAddress: '127.0.0.1',
		identity: { subjectId: 'user-1', consentBinding: 'session-1' },
	};
}

function authorizeUrl(overrides: Record<string, string | null> = {}): string {
	const url = new URL('/oauth/authorize', issuer);
	const values: Record<string, string> = {
		client_id: 'client-1',
		redirect_uri: redirectUri,
		response_type: 'code',
		code_challenge: challenge,
		resource,
	};
	for (const [key, value] of Object.entries({ ...values, ...overrides }))
		if (value !== null) url.searchParams.set(key, value);
	return url.toString();
}

function approval(presentation: Extract<ConsentPresentation, { mode: 'prompt' }>, origin = issuer) {
	const body = new URLSearchParams({
		transaction_id: presentation.transactionId,
		csrf_token: presentation.csrfToken,
	});
	const request = new Request(`${issuer}/oauth/authorize/approve`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
		body,
	});
	return context(request.url, request);
}

async function prompt(overrides: Record<string, string | null> = {}) {
	const response = await handleOauthAuthorizeGet(context(authorizeUrl(overrides)), seams);
	expect(response.status).toBe(200);
	const presentation = presentations.at(-1);
	if (!presentation || presentation.mode !== 'prompt') throw new Error('Expected consent prompt');
	return presentation;
}

beforeEach(async () => {
	presentations = [];
	recordedEvents = [];
	const stores = createInMemoryOAuthStores();
	await stores.clients.register({
		clientId: 'client-1',
		clientSecretHash: null,
		clientSecretExpiresAt: null,
		clientName: 'Test Client',
		clientType: 'public',
		tokenEndpointAuthMethod: 'none',
		applicationType: 'web',
		redirectUris: [redirectUri],
		grantTypes: ['authorization_code'],
		responseTypes: ['code'],
		clientIdMetadataUrl: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	seams = {
		stores,
		scopes,
		hashCredential,
		fetchClientIdMetadataDocument: async () => null,
		configuration: {
			issuer,
			baseUrl: new URL(issuer),
			resource: new URL(resource),
			accessTokenTtlSeconds: 3600,
			refreshTokenTtlSeconds: 86_400,
			clientSecretTtlSeconds: 7200,
			isTrustedOrigin: (origin) => origin === issuer,
			trustedProxy: {
				trustedProxyCidrs: [],
				trustedProxyHeader: undefined,
				trustedProxyHopCount: 0,
			},
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
		},
		resolveIdentityBinding: async () => ({ subjectId: 'user-1', consentBinding: 'session-1' }),
		resolveUserProfile: async (subjectId) => ({
			id: subjectId,
			email: 'user@example.com',
			name: 'Test User',
			image: null,
			role: 'user',
		}),
		handleUnauthenticatedAuthorization: () => new Response(null, { status: 302 }),
		renderConsent: (presentation) => {
			presentations.push(presentation);
			return new Response(null, { status: presentation.mode === 'error' ? 400 : 200 });
		},
		recordEvent: (event) => recordedEvents.push(event),
	};
});

describe('authorize endpoint extraction', () => {
	test('matches exact redirects and only permits RFC 8252 port variation for the same loopback route', () => {
		expect(redirectUriMatchesRegistered(redirectUri, [redirectUri])).toBe(true);
		for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
			const registered = `http://${hostname}:4100/callback?channel=desktop`;
			const requested = `http://${hostname}:5100/callback?channel=desktop`;
			expect(redirectUriMatchesRegistered(requested, [registered])).toBe(true);
		}
		for (const requested of [
			'http://localhost:5100/different?channel=desktop',
			'http://localhost:5100/callback?channel=other',
			'http://127.0.0.1:5100/callback?channel=desktop',
			'http://[::1]:5100/callback?channel=desktop',
			'https://client.example.com/different',
			'https://client.example.com:8443/callback',
			'https://client.example.com.evil.example/callback',
		]) {
			expect(
				redirectUriMatchesRegistered(requested, [
					'not-a-uri',
					'http://localhost:4100/callback?channel=desktop',
				]),
			).toBe(false);
		}
		expect(
			redirectUriMatchesRegistered('http://[0:0:0:0:0:0:0:1]:5100/callback', [
				'http://[::1]:4100/callback',
			]),
		).toBe(true);
		for (const invalid of [
			'https://*.client.example.com/callback',
			'https://user@client.example.com/callback',
			'https://client.example.com/callback#fragment',
		]) {
			expect(redirectUriMatchesRegistered(invalid, [invalid])).toBe(false);
		}
		expect(
			redirectUriMatchesRegistered('http://127.0.0.1:5100/callback', [
				'http://127.0.0.1:4100/callback#fragment',
			]),
		).toBe(false);
		expect(redirectUriMatchesRegistered('not-a-uri', [redirectUri])).toBe(false);
	});

	test('uses exactly the two transaction-bound approve and deny form fields', () => {
		expect(authorizeFormParameterNames).toEqual(['transaction_id', 'csrf_token']);
	});

	test('grants the injected vocabulary by default and accepts a consumer-only scope', async () => {
		const all = await prompt();
		expect(all.requester).toEqual({
			id: 'user-1',
			email: 'user@example.com',
			name: 'Test User',
			image: null,
			role: 'user',
		});
		expect(all.scopes.map(({ scope }) => scope)).toEqual(['custom', 'read', 'write']);
		const custom = await prompt({ scope: 'custom' });
		expect(custom.scopes).toEqual([{ scope: 'custom', description: 'Custom access.' }]);
	});

	test('resolves host identity when request context does not provide it', async () => {
		let resolutions = 0;
		seams.resolveIdentityBinding = async () => {
			resolutions += 1;
			return { subjectId: 'user-1', consentBinding: 'session-1' };
		};
		const unresolved = context(authorizeUrl());
		unresolved.identity = null;
		expect((await handleOauthAuthorizeGet(unresolved, seams)).status).toBe(200);
		expect(resolutions).toBe(1);
	});

	test('distinguishes an omitted scope from an empty or unknown scope and redirects verified failures', async () => {
		await prompt({ scope: null });
		for (const scope of ['', 'outside']) {
			const response = await handleOauthAuthorizeGet(context(authorizeUrl({ scope })), seams);
			expect(response.status).toBe(302);
			const location = new URL(response.headers.get('location')!);
			expect(location.origin + location.pathname).toBe(redirectUri);
			expect(location.searchParams.get('error')).toBe('invalid_scope');
		}
	});

	test('redirects a mismatched resource through the verified client callback', async () => {
		const response = await handleOauthAuthorizeGet(
			context(authorizeUrl({ resource: 'https://other.example.com/mcp' })),
			seams,
		);
		expect(response.status).toBe(302);
		expect(new URL(response.headers.get('location')!).searchParams.get('error')).toBe(
			'invalid_target',
		);
	});

	test('rejects fragments and userinfo on both requested and registered redirect URIs', async () => {
		for (const invalid of [`${redirectUri}#fragment`, 'https://user@client.example.com/callback']) {
			const requested = await handleOauthAuthorizeGet(
				context(authorizeUrl({ redirect_uri: invalid })),
				seams,
			);
			expect(requested.status).toBe(400);
		}
		await seams.stores.clients.update('client-1', { redirectUris: [`${redirectUri}#fragment`] });
		expect((await handleOauthAuthorizeGet(context(authorizeUrl()), seams)).status).toBe(400);
		await seams.stores.clients.update('client-1', {
			redirectUris: ['https://user@client.example.com/callback'],
		});
		expect((await handleOauthAuthorizeGet(context(authorizeUrl()), seams)).status).toBe(400);
	});

	test('editing the transaction id in the approve form is rejected and issues no code', async () => {
		const presentation = await prompt({ scope: 'read' });
		const wrongId = approval({ ...presentation, transactionId: '0'.repeat(64) });
		expect((await handleOauthAuthorizeApprove(wrongId, seams)).status).toBe(400);
		expect(await seams.stores.codes.findByHash(hashCredential('missing'))).toBeNull();
	});

	test('editing the csrf token in the approve form is rejected and issues no code', async () => {
		const presentation = await prompt({ scope: 'read' });
		const wrongCsrf = approval({ ...presentation, csrfToken: '0'.repeat(64) });
		expect((await handleOauthAuthorizeApprove(wrongCsrf, seams)).status).toBe(400);
	});

	test('a cross-site approve request is rejected even with the correct transaction id and csrf token', async () => {
		const presentation = await prompt({ scope: 'read' });
		expect(
			(await handleOauthAuthorizeApprove(approval(presentation, 'https://attacker.example'), seams))
				.status,
		).toBe(403);
	});

	test('accepts the canonical authorization-server origin independently of the MCP allow-list', async () => {
		const presentation = await prompt({ scope: 'read' });
		seams.configuration.isTrustedOrigin = () => false;
		expect(
			(await handleOauthAuthorizeApprove(approval(presentation, `${issuer}/`), seams)).status,
		).toBe(302);
	});

	test('rejects approval after the authenticated subject changes within one consent binding', async () => {
		const presentation = await prompt({ scope: 'read' });
		const switched = approval(presentation);
		switched.identity = null;
		seams.resolveIdentityBinding = async () => ({
			subjectId: 'user-2',
			consentBinding: 'session-1',
		});
		expect((await handleOauthAuthorizeApprove(switched, seams)).status).toBe(400);
	});

	test('approving with the exact issued transaction id and csrf token succeeds exactly once', async () => {
		const presentation = await prompt({ scope: 'read' });
		const response = await handleOauthAuthorizeApprove(approval(presentation), seams);
		expect(response.status).toBe(302);
		expect((await handleOauthAuthorizeApprove(approval(presentation), seams)).status).toBe(400);
	});

	test('denial consumes the transaction and returns the transaction-bound issuer and state', async () => {
		const presentation = await prompt({ scope: 'read', state: 'client-state' });
		const response = await handleOauthAuthorizeDeny(approval(presentation), seams);
		expect(response.status).toBe(302);
		const location = new URL(response.headers.get('location')!);
		expect(location.searchParams.get('error')).toBe('access_denied');
		expect(location.searchParams.get('state')).toBe('client-state');
		expect(location.searchParams.get('iss')).toBe(issuer);
		expect(recordedEvents).toContainEqual({
			category: 'authorization',
			outcome: 'user_denied',
			attributes: { clientId: 'client-1' },
		});
		expect((await handleOauthAuthorizeDeny(approval(presentation), seams)).status).toBe(400);
	});

	test('reopens the exact transaction consumption when code issuance fails', async () => {
		const presentation = await prompt({ scope: 'read' });
		const realCodes = seams.stores.codes;
		let fail = true;
		seams.stores.codes = {
			...realCodes,
			issue: async (record) => {
				if (fail) {
					fail = false;
					throw new Error('simulated issue failure');
				}
				await realCodes.issue(record);
			},
		};
		await expect(handleOauthAuthorizeApprove(approval(presentation), seams)).rejects.toThrow(
			'simulated issue failure',
		);
		expect((await handleOauthAuthorizeApprove(approval(presentation), seams)).status).toBe(302);
	});

	test('carries each transaction own approved scope into its code', async () => {
		const read = await prompt({ scope: 'read' });
		const write = await prompt({ scope: 'write' });
		for (const presentation of [read, write]) {
			const response = await handleOauthAuthorizeApprove(approval(presentation), seams);
			const code = new URL(response.headers.get('location')!).searchParams.get('code')!;
			const stored = await seams.stores.codes.findByHash(hashCredential(code));
			expect(stored?.scope).toBe(presentation.scopes[0]?.scope);
		}
	});
});
