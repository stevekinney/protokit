import { afterEach, describe, expect, it } from 'bun:test';

/**
 * DOCS-001: the privacy/terms/support pages themselves, and the RFC
 * 8414/9728 metadata fields that link to them. Owned by DOCS-001 as a new
 * file rather than an edit to `oauth-discovery.test.ts` (owned by
 * `OAUTH-001`) — see this item's own `.roadmap-progress/DOCS-001.md`.
 */

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';
// `@t3-oss/env-core` validates `process.env` once, at import time — set
// `BASE_URL` before `@web/application` (and therefore `@web/env`) is first
// imported, matching `oauth-discovery.test.ts`'s established convention.
process.env.BASE_URL = 'https://canonical.example.com';

const { handleApplicationRequest } = await import('@web/application');

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

async function fetchJson(port: number, path: string): Promise<Record<string, unknown>> {
	const response = await fetch(`http://127.0.0.1:${port}${path}`);
	expect(response.status).toBe(200);
	return (await response.json()) as Record<string, unknown>;
}

async function fetchHtml(port: number, path: string): Promise<{ status: number; body: string }> {
	const response = await fetch(`http://127.0.0.1:${port}${path}`);
	return { status: response.status, body: await response.text() };
}

describe('privacy/terms/support pages', () => {
	it('serve 200 HTML with real content, not placeholder text, for an unauthenticated caller', async () => {
		const port = startServer();

		for (const path of ['/privacy', '/terms', '/support']) {
			const { status, body } = await fetchHtml(port, path);
			expect(status).toBe(200);
			expect(body).toContain('<!doctype html>');
			// Never a session lookup / auth requirement — OPS-002's
			// dispatchWithoutSession pattern.
			expect(body.toLowerCase()).not.toContain('sign in required');
			expect(body).not.toContain('Lorem ipsum');
			expect(body).not.toContain('TODO');
		}
	});

	it('describe real data categories, subprocessors, and consent language on the privacy page', async () => {
		const port = startServer();
		const { body } = await fetchHtml(port, '/privacy');

		expect(body).toContain('Neon');
		expect(body).toContain('Google');
		expect(body).toContain('Railway');
		expect(body).toContain('Retention and deletion');
		expect(body).toContain('Consent');
	});

	it('name a real removal/revocation path on the support page', async () => {
		const port = startServer();
		const { body } = await fetchHtml(port, '/support');

		expect(body).toContain('Removing a connector');
		expect(body).toContain('revoke');
	});

	it('render an honest "not configured" notice, never a fabricated address, when SUPPORT_CONTACT_EMAIL is unset', async () => {
		const port = startServer();
		const { body } = await fetchHtml(port, '/support');

		// This test suite never sets SUPPORT_CONTACT_EMAIL, so the page must
		// not invent one.
		expect(body).toContain('has not configured a support contact');
		expect(body).not.toContain('support@example.com');
	});

	it('never queries session storage — served identically with or without a cookie', async () => {
		const port = startServer();
		const withoutCookie = await fetch(`http://127.0.0.1:${port}/privacy`);
		const withForgedCookie = await fetch(`http://127.0.0.1:${port}/privacy`, {
			headers: { cookie: 'application_session=forged-value-that-is-not-a-real-session' },
		});
		expect(withoutCookie.status).toBe(200);
		expect(withForgedCookie.status).toBe(200);
		expect(await withoutCookie.text()).toBe(await withForgedCookie.text());
	});
});

describe('OAuth metadata links to privacy/terms/support', () => {
	it('authorization server metadata carries RFC 8414 documentation/policy/terms fields pointing at this canonical origin', async () => {
		const port = startServer();
		const body = await fetchJson(port, '/.well-known/oauth-authorization-server');

		expect(body.service_documentation).toBe('https://canonical.example.com/support');
		expect(body.op_policy_uri).toBe('https://canonical.example.com/privacy');
		expect(body.op_tos_uri).toBe('https://canonical.example.com/terms');
	});

	it('protected resource metadata (both root and /mcp) carries RFC 9728 documentation/policy/terms fields', async () => {
		const port = startServer();
		const prm = await fetchJson(port, '/.well-known/oauth-protected-resource');
		const prmMcp = await fetchJson(port, '/.well-known/oauth-protected-resource/mcp');

		for (const body of [prm, prmMcp]) {
			expect(body.resource_documentation).toBe('https://canonical.example.com/support');
			expect(body.resource_policy_uri).toBe('https://canonical.example.com/privacy');
			expect(body.resource_tos_uri).toBe('https://canonical.example.com/terms');
			expect(typeof body.resource_name).toBe('string');
			expect((body.resource_name as string).length > 0).toBe(true);
		}
	});

	it('every metadata link resolves to a real 200 response on this server, not a dead reference', async () => {
		const port = startServer();
		const authServerMetadata = await fetchJson(port, '/.well-known/oauth-authorization-server');
		const protectedResourceMetadata = await fetchJson(
			port,
			'/.well-known/oauth-protected-resource',
		);

		const links = [
			authServerMetadata.service_documentation,
			authServerMetadata.op_policy_uri,
			authServerMetadata.op_tos_uri,
			protectedResourceMetadata.resource_documentation,
			protectedResourceMetadata.resource_policy_uri,
			protectedResourceMetadata.resource_tos_uri,
		] as string[];

		for (const link of links) {
			const path = new URL(link).pathname;
			const response = await fetch(`http://127.0.0.1:${port}${path}`);
			expect(response.status).toBe(200);
		}
	});

	it('reports BASE_URL, never a spoofed Host header, on every legal-link metadata field', async () => {
		const port = startServer();
		const response = await fetch(
			`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`,
			{
				headers: { host: 'attacker.example.com' },
			},
		);
		const spoofed = (await response.json()) as Record<string, unknown>;
		expect(spoofed.service_documentation).toBe('https://canonical.example.com/support');
		expect(spoofed.op_policy_uri).toBe('https://canonical.example.com/privacy');
		expect(spoofed.op_tos_uri).toBe('https://canonical.example.com/terms');
	});
});
