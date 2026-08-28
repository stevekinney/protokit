import { afterEach, describe, expect, it } from 'bun:test';
import { templateRegistry } from '@lostgradient/mcp';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';
process.env.BASE_URL = process.env.BASE_URL ?? 'https://ui-extension-metadata.example.com';
// The scenario this file exists to prove: an operator (or this repository's
// own setup wizard) turns the flag on even though no real MCP App resource
// is registered.
process.env.MCP_ENABLE_UI_EXTENSION = 'true';

const { handleApplicationRequest } = await import('@web/application');
const { hasRegisteredUiExtensionResource } = await import('@lostgradient/mcp');

/**
 * Review finding: the MCP server's real `/mcp` capabilities (`server.ts`)
 * suppress the UI extension unless an actual `RESOURCE_MIME_TYPE` resource
 * is registered, in addition to the `MCP_ENABLE_UI_EXTENSION` flag. Before
 * this fix, `handleOauthAuthorizationMetadataGet` advertised the extension
 * based solely on the flag, so a client could discover UI-extension support
 * in OAuth metadata and then receive server capabilities without it.
 *
 * Both call sites now share `hasRegisteredUiExtensionResource(templateRegistry)` (see its
 * doc comment in `packages/mcp/src/ui-extension-support.ts`), so this test
 * asserts the observable contract: with the flag on and no MCP App
 * registered (this repository's actual state -- `packages/mcp-apps` ships
 * no application), the authorization-server metadata must NOT advertise the
 * extension either.
 */

let server: Bun.Server | null = null;

afterEach(() => {
	server?.stop(true);
	server = null;
});

function startServer(): number {
	server = Bun.serve({
		port: 0,
		fetch(request, bunServer) {
			return handleApplicationRequest(request, {
				clientAddress: bunServer.requestIP(request)?.address,
			});
		},
	});
	return server.port;
}

describe('OAuth UI-extension metadata agrees with real MCP server capabilities', () => {
	it('this repository genuinely has no registered MCP App resource (sanity check for the rest of this file)', () => {
		// If this ever becomes true (a real MCP App ships), the test below
		// should start asserting the opposite -- see its own comment.
		expect(hasRegisteredUiExtensionResource(templateRegistry)).toBe(false);
	});

	it('does not advertise the UI extension in authorization server metadata when the flag is on but no MCP App resource is registered', async () => {
		const port = startServer();
		const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { extensions: Record<string, unknown> };
		// The flag alone (`MCP_ENABLE_UI_EXTENSION=true`, set above) must not
		// be sufficient: without a registered `RESOURCE_MIME_TYPE` resource,
		// this document must agree with what `/mcp` actually serves.
		expect(body.extensions).toEqual({});
	});
});
