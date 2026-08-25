import { afterEach, describe, expect, it } from 'bun:test';
import { fetchFromTestServer, startTestServer } from '@web/test-support/start-test-server';
import type { TestServerHandle } from '@web/test-support/start-test-server';

/**
 * SEC-002: proves, against a real dispatcher and a real (not mocked)
 * `mcp-origin-validation.ts`/`mcp-routes.ts`, the two request-boundary
 * controls the roadmap names explicitly -- cross-site rejection and
 * localhost DNS-rebinding rejection -- and that both fire before the
 * bearer-token lookup (a 403 with `error: "forbidden"`, never a 401, which
 * would mean the request reached the authentication branch instead).
 *
 * `mcp-routes.test.ts` proves the rest of `authenticateMcpUser`'s branches
 * against a mocked `@web/lib/mcp-origin-validation` and `@template/mcp`;
 * this file is the sibling that proves the real implementations, wired
 * together, produce the same result end to end -- the same relationship
 * `oauth-mcp-resource-binding.integration.test.ts` has to `oauth-routes.test.ts`.
 */

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.SESSION_SIGNING_SECRET =
	process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
// Two entries, one loopback and one not, so the DNS-rebinding suite below
// can isolate that check from the plain origin allow-list check: an origin
// that IS allow-listed but is NOT loopback must still be rejected once the
// request itself is targeting a loopback host, because the allow-list
// check alone would let it through.
process.env.MCP_ALLOWED_ORIGINS =
	process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000,https://claude.ai';
// Explicit, not relying on defaults: this file's whole point is proving
// the DNS-rebinding gate is active in exactly this (non-conformance,
// non-tunnel) shape.
process.env.MCP_CONFORMANCE_MODE = 'false';
process.env.PROTOKIT_TUNNEL_ACTIVE = 'false';

const { handleApplicationRequest } = await import('@web/application');

let redisAvailable: boolean;
try {
	const { isRedisHealthy } = await import('@web/lib/redis-client');
	redisAvailable = await Promise.race([
		isRedisHealthy(),
		new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
	]);
} catch {
	redisAvailable = false;
}

if (redisAvailable) {
	const { resetRateLimitState } = await import('@web/test-support/reset-rate-limit-state');
	await resetRateLimitState();
}

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

let server: TestServerHandle | null = null;

afterEach(() => {
	server?.stop();
	server = null;
});

function startServer(): TestServerHandle {
	server = startTestServer((request, bunServer) =>
		handleApplicationRequest(request, {
			clientAddress: bunServer.requestIP(request)?.address,
		}),
	);
	return server;
}

const initializeBody = JSON.stringify({
	jsonrpc: '2.0',
	method: 'initialize',
	id: 1,
	params: {
		protocolVersion: '2025-11-25',
		capabilities: {},
		clientInfo: { name: 'test', version: '0.1.0' },
	},
});

describeWithRedis('MCP boundary controls (requires Redis)', () => {
	describe('cross-site request rejection', () => {
		it('rejects an Origin not on the allow-list, before authentication is ever checked', async () => {
			const handle = startServer();
			const response = await fetchFromTestServer(handle, '/mcp', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
					Origin: 'https://evil.example',
					// No Authorization header at all -- if this request reached the
					// authentication branch it would 401, not 403.
				},
				body: initializeBody,
			});
			expect(response.status).toBe(403);
			const body = (await response.json()) as Record<string, string>;
			expect(body.error).toBe('forbidden');
		});

		it('rejects a sandboxed ("null") origin', async () => {
			const handle = startServer();
			const response = await fetchFromTestServer(handle, '/mcp', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
					Origin: 'null',
				},
				body: initializeBody,
			});
			expect(response.status).toBe(403);
		});

		it('allows an origin on the allow-list through to authentication (401, not 403)', async () => {
			const handle = startServer();
			const response = await fetchFromTestServer(handle, '/mcp', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
					Origin: 'http://localhost:3000',
				},
				body: initializeBody,
			});
			expect(response.status).toBe(401);
		});

		it('allows a request with no Origin header at all (non-browser MCP clients)', async () => {
			const handle = startServer();
			const response = await fetchFromTestServer(handle, '/mcp', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
				},
				body: initializeBody,
			});
			expect(response.status).toBe(401);
		});
	});

	describe('localhost DNS-rebinding rejection', () => {
		it('rejects a request to a loopback host whose Origin is allow-listed but not itself loopback', async () => {
			// The plain origin allow-list check alone would ADMIT this request
			// -- `https://claude.ai` is on `MCP_ALLOWED_ORIGINS`. Getting 403 here
			// proves the localhost DNS-rebinding check (SEC-002: fixed to run
			// outside conformance mode, see `mcp-routes.ts`'s
			// `isDnsRebindingProtectionActive`) is the one doing the rejecting,
			// not the allow-list.
			const handle = startServer();
			const response = await fetchFromTestServer(handle, '/mcp', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
					Origin: 'https://claude.ai',
				},
				body: initializeBody,
			});
			expect(response.status).toBe(403);
			const body = (await response.json()) as Record<string, string>;
			expect(body.error).toBe('forbidden');
		});

		it('allows a same-loopback Host/Origin pair through to authentication (401, not 403)', async () => {
			const handle = startServer();
			const response = await fetchFromTestServer(handle, '/mcp', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
					Origin: 'http://localhost:3000',
				},
				body: initializeBody,
			});
			expect(response.status).toBe(401);
		});
	});
});
