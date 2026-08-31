import { describe, expect, it } from 'bun:test';
import type { CrossInstanceMessaging } from '@lostgradient/mcp/oauth';
import { createOauthAuthorizeHostSeams } from '@web/lib/oauth-authorize-seams';

describe('createOauthAuthorizeHostSeams', () => {
	it('constructs all six OAuth host capabilities including cross-instance messaging', () => {
		const crossInstanceMessaging: CrossInstanceMessaging = {
			publish: async () => {},
			subscribe: async () => async () => {},
		};
		const request = new Request('http://localhost:3000/oauth/authorize');
		const seams = createOauthAuthorizeHostSeams(
			{
				request,
				requestUrl: new URL(request.url),
				requestId: 'request-1',
				clientAddress: '127.0.0.1',
				networkIdentity: '127.0.0.1',
				user: null,
				sessionToken: null,
			},
			{ crossInstanceMessaging },
		);

		expect(typeof seams.resolveIdentityBinding).toBe('function');
		expect(seams.stores).toBeDefined();
		expect(typeof seams.renderConsent).toBe('function');
		expect(seams.scopes.supportedScopes.length).toBeGreaterThan(0);
		expect(seams.configuration.resource.href).toBe('http://localhost:3000/mcp');
		expect(seams.crossInstanceMessaging).toBe(crossInstanceMessaging);
	});
});
