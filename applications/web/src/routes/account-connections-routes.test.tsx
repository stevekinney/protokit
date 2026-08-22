import { describe, expect, it, mock } from 'bun:test';

mock.module('@web/env', () => ({
	environment: {
		SESSION_SIGNING_SECRET: 'a-very-secret-key-that-is-at-least-32-chars-long',
		SESSION_SIGNING_SECRET_PREVIOUS: undefined,
		NODE_ENV: 'test',
	},
}));

let mockRevokeUserClientGrantCalls: Array<{ userId: string; clientId: string }> = [];
let mockRevokeAllUserGrantsCalls: string[] = [];

mock.module('@web/lib/consent-inventory', () => ({
	listUserConnections: async () => [],
	revokeUserClientGrant: async (userId: string, clientId: string) => {
		mockRevokeUserClientGrantCalls.push({ userId, clientId });
		return { revokedAccessTokens: 1, revokedRefreshTokens: 1 };
	},
	revokeAllUserGrants: async (userId: string) => {
		mockRevokeAllUserGrantsCalls.push(userId);
		return { revokedAccessTokens: 2, revokedRefreshTokens: 2 };
	},
}));

const { handleAccountConnectionRevokePost, handleAccountConnectionsRevokeAllPost } =
	await import('@web/routes/account-connections-routes');
const { deriveSessionCsrfToken } = await import('@web/lib/csrf-protection');

import type { RequestContext } from '@web/lib/request-context';

const testUser = {
	id: 'user-1',
	email: 'alice@example.com',
	name: 'Alice',
	image: null,
	role: 'user',
};
const testSessionToken = 'session-token-abc';

function createContext(
	overrides: Partial<{
		url: string;
		headers: Record<string, string>;
		body: string;
		user: RequestContext['user'];
		sessionToken: string | null;
	}> = {},
): RequestContext {
	const url = overrides.url ?? 'http://localhost:3000/account/connections/revoke';
	const request = new Request(url, {
		method: 'POST',
		headers: overrides.headers,
		body: overrides.body,
	});
	return {
		request,
		requestUrl: new URL(url),
		requestId: 'req-1',
		networkIdentity: '203.0.113.1',
		user: overrides.user === undefined ? testUser : overrides.user,
		sessionToken: overrides.sessionToken === undefined ? testSessionToken : overrides.sessionToken,
	};
}

const trustedHeaders = {
	'content-type': 'application/x-www-form-urlencoded',
	'sec-fetch-site': 'same-origin',
	origin: 'http://localhost:3000',
};

describe('handleAccountConnectionRevokePost', () => {
	it('returns 401 when there is no active session', async () => {
		const context = createContext({ user: null, sessionToken: null });
		const response = await handleAccountConnectionRevokePost(context);
		expect(response.status).toBe(401);
	});

	it('returns 403 when the request is not same-origin', async () => {
		const context = createContext({
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'cross-site',
			},
			body: 'client_id=c1',
		});
		const response = await handleAccountConnectionRevokePost(context);
		expect(response.status).toBe(403);
	});

	it('returns 403 with a missing or invalid CSRF token', async () => {
		const context = createContext({
			headers: trustedHeaders,
			body: 'client_id=c1&csrf_token=wrong',
		});
		const response = await handleAccountConnectionRevokePost(context);
		expect(response.status).toBe(403);
	});

	it('returns 400 when client_id is missing', async () => {
		const csrfToken = deriveSessionCsrfToken(testSessionToken);
		const context = createContext({
			headers: trustedHeaders,
			body: `csrf_token=${csrfToken}`,
		});
		const response = await handleAccountConnectionRevokePost(context);
		expect(response.status).toBe(400);
	});

	it('revokes the named client and redirects on success', async () => {
		mockRevokeUserClientGrantCalls = [];
		const csrfToken = deriveSessionCsrfToken(testSessionToken);
		const context = createContext({
			headers: trustedHeaders,
			body: `client_id=c1&csrf_token=${csrfToken}`,
		});
		const response = await handleAccountConnectionRevokePost(context);
		expect(response.status).toBe(303);
		expect(mockRevokeUserClientGrantCalls).toEqual([{ userId: 'user-1', clientId: 'c1' }]);
	});
});

describe('handleAccountConnectionsRevokeAllPost', () => {
	it('returns 401 when there is no active session', async () => {
		const context = createContext({
			url: 'http://localhost:3000/account/connections/revoke-all',
			user: null,
			sessionToken: null,
		});
		const response = await handleAccountConnectionsRevokeAllPost(context);
		expect(response.status).toBe(401);
	});

	it('returns 403 with a missing or invalid CSRF token', async () => {
		const context = createContext({
			url: 'http://localhost:3000/account/connections/revoke-all',
			headers: trustedHeaders,
			body: 'csrf_token=wrong',
		});
		const response = await handleAccountConnectionsRevokeAllPost(context);
		expect(response.status).toBe(403);
	});

	it('revokes every connection and redirects on success', async () => {
		mockRevokeAllUserGrantsCalls = [];
		const csrfToken = deriveSessionCsrfToken(testSessionToken);
		const context = createContext({
			url: 'http://localhost:3000/account/connections/revoke-all',
			headers: trustedHeaders,
			body: `csrf_token=${csrfToken}`,
		});
		const response = await handleAccountConnectionsRevokeAllPost(context);
		expect(response.status).toBe(303);
		expect(mockRevokeAllUserGrantsCalls).toEqual(['user-1']);
	});
});
