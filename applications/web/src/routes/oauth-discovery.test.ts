import { afterEach, describe, expect, it } from 'bun:test';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';
// `env.ts` validates `process.env` once, at import time, so
// `BASE_URL` must be set before `@web/application` (and therefore `@web/env`)
// is first imported — setting it later in this file would have no effect on
// the already-validated `environment` singleton.
process.env.BASE_URL = 'https://canonical.example.com';

const { handleApplicationRequest } = await import('@web/application');

/**
 * OAUTH-001 acceptance criterion: "Protected-resource metadata,
 * authorization server metadata, authorization responses, token audience
 * data, and MCP validation agree on one canonical HTTPS origin," and
 * "Derive issuer and resource identifiers from required production
 * configuration, never from an untrusted Host or forwarding header."
 *
 * This file boots the real dispatcher (no mocked routes, no database —
 * none of these three metadata endpoints touch it) with `BASE_URL` set, the
 * production configuration this server is required to run with, and proves
 * every discovery document reports that one canonical origin — including
 * under a request whose `Host` header claims to be a different origin
 * entirely, which is exactly what an attacker fronting this server with a
 * spoofed `Host` would send.
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

async function fetchJson(
	port: number,
	path: string,
	headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
	const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
	expect(response.status).toBe(200);
	return (await response.json()) as Record<string, unknown>;
}

describe('discovery documents agree on one canonical origin', () => {
	it('authorization server metadata reports the configured BASE_URL as issuer', async () => {
		const port = startServer();
		const body = await fetchJson(port, '/.well-known/oauth-authorization-server');
		expect(body.issuer).toBe('https://canonical.example.com');
		expect(body.authorization_endpoint).toBe('https://canonical.example.com/oauth/authorize');
		expect(body.token_endpoint).toBe('https://canonical.example.com/oauth/token');
	});

	it('protected resource metadata and protected resource MCP metadata name the same resource URL', async () => {
		const port = startServer();
		const prm = await fetchJson(port, '/.well-known/oauth-protected-resource');
		const prmMcp = await fetchJson(port, '/.well-known/oauth-protected-resource/mcp');
		expect(prm.resource).toBe('https://canonical.example.com/mcp');
		expect(prmMcp.resource).toBe('https://canonical.example.com/mcp');
		expect(prm.authorization_servers).toEqual(['https://canonical.example.com']);
		expect(prmMcp.authorization_servers).toEqual(['https://canonical.example.com']);
	});

	it('the authorization server metadata issuer and the protected resource authorization_servers entry agree', async () => {
		const port = startServer();
		const authServerMetadata = await fetchJson(port, '/.well-known/oauth-authorization-server');
		const protectedResourceMetadata = await fetchJson(
			port,
			'/.well-known/oauth-protected-resource',
		);
		expect((protectedResourceMetadata.authorization_servers as string[])[0]).toBe(
			authServerMetadata.issuer,
		);
	});

	it('every metadata endpoint reports BASE_URL, not a spoofed Host header', async () => {
		const port = startServer();
		const spoofedHeaders = { host: 'attacker.example.com' };

		const authServerMetadata = await fetchJson(
			port,
			'/.well-known/oauth-authorization-server',
			spoofedHeaders,
		);
		const protectedResourceMetadata = await fetchJson(
			port,
			'/.well-known/oauth-protected-resource',
			spoofedHeaders,
		);
		const protectedResourceMcpMetadata = await fetchJson(
			port,
			'/.well-known/oauth-protected-resource/mcp',
			spoofedHeaders,
		);

		expect(authServerMetadata.issuer).toBe('https://canonical.example.com');
		expect(protectedResourceMetadata.resource).toBe('https://canonical.example.com/mcp');
		expect(protectedResourceMcpMetadata.resource).toBe('https://canonical.example.com/mcp');
	});
});
