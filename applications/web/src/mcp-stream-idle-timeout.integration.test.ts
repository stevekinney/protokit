import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';

/**
 * `OPS-001`: regression test for a real defect found while building this
 * item's deployed-streaming proof -- `Bun.serve()`'s own default
 * `idleTimeout` is 10 seconds, shorter than the MCP SDK's 15-second
 * `subscriptions/listen` keep-alive interval, so this server was killing
 * its own long-lived SSE streams ("request timed out after 10 seconds")
 * before the SDK's keep-alive frame ever had a chance to prevent that --
 * entirely independent of any reverse proxy in front of it. `server.ts`
 * now sets `idleTimeout` explicitly above the SDK's interval.
 *
 * Spawns the real entrypoint as a subprocess (not Docker, not an
 * in-process `Bun.serve()` stand-in), opens a genuine
 * `subscriptions/listen` stream through the real `@modelcontextprotocol/client`
 * SDK, and holds it open past the OLD 10-second default -- if this
 * server's `idleTimeout` regresses to Bun's default, this test times out
 * waiting for the subscription instead of passing.
 */

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

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

const testRunId = randomUUID();
const userId = randomUUID();
const clientId = `mcp-stream-idle-timeout-test-${testRunId}`;
const accessToken = `mcp-stream-idle-timeout-test-token-${testRunId}`;

async function findFreePort(): Promise<number> {
	const probe = Bun.serve({ port: 0, fetch: () => new Response('ok') });
	const port = probe.port;
	probe.stop(true);
	return port;
}

async function waitForHealthy(baseUrl: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1_000) });
			if (response.ok) return;
		} catch (error) {
			lastError = error;
		}
		await Bun.sleep(150);
	}
	throw new Error(`server did not become healthy within ${timeoutMs}ms: ${String(lastError)}`);
}

beforeAll(async () => {
	await database.insert(schema.users).values({
		id: userId,
		email: `mcp-stream-idle-timeout-test-${testRunId}@example.com`,
		name: 'MCP Stream Idle Timeout Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: null,
		clientName: 'MCP Stream Idle Timeout Test Client',
		clientType: 'public',
		tokenEndpointAuthMethod: 'none',
		redirectUris: ['https://example.com/callback'],
		grantTypes: ['authorization_code', 'refresh_token'],
		responseTypes: ['code'],
	});
});

afterAll(async () => {
	await database.delete(schema.oauthTokens).where(eq(schema.oauthTokens.clientId, clientId));
	await database.delete(schema.oauthClients).where(eq(schema.oauthClients.clientId, clientId));
	await database.delete(schema.users).where(eq(schema.users.id, userId));
});

describeWithRedis(
	"MCP subscriptions/listen stream survives past Bun.serve's old 10s default idle timeout (requires Redis, spawns a real subprocess)",
	() => {
		it('stays open at least 12 seconds without the server closing it', async () => {
			const port = await findFreePort();
			const baseUrl = `http://127.0.0.1:${port}`;

			await database.insert(schema.oauthTokens).values({
				accessToken: hashCredential(accessToken),
				clientId,
				userId,
				scope: 'profile',
				resource: `${baseUrl}/mcp`,
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
			});

			const subprocess = Bun.spawn(['bun', 'src/server.ts'], {
				cwd: `${import.meta.dir}/..`,
				env: {
					...process.env,
					NODE_ENV: 'test',
					PORT: String(port),
					BASE_URL: baseUrl,
					GOOGLE_CLIENT_ID: process.env['GOOGLE_CLIENT_ID'] ?? 'google-client-id',
					GOOGLE_CLIENT_SECRET: process.env['GOOGLE_CLIENT_SECRET'] ?? 'google-client-secret',
					SESSION_SIGNING_SECRET:
						process.env['SESSION_SIGNING_SECRET'] ??
						'development-session-secret-with-at-least-32-characters',
					MCP_ALLOWED_ORIGINS: baseUrl,
					RATE_LIMIT_KEY_NAMESPACE: `mcp-stream-idle-timeout-${testRunId}`,
				},
				stdout: 'pipe',
				stderr: 'pipe',
			});

			try {
				await waitForHealthy(baseUrl, 15_000);

				const client = new Client(
					{ name: 'idle-timeout-regression-test', version: '1.0.0' },
					{ versionNegotiation: { mode: { pin: '2026-07-28' } } },
				);
				const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
					fetch: (input, init) => {
						const headers = new Headers(init?.headers);
						headers.set('authorization', `Bearer ${accessToken}`);
						return fetch(input, { ...init, headers });
					},
				});

				await client.connect(transport);
				expect(client.getProtocolEra()).toBe('modern');

				const subscription = await client.listen({ resourceSubscriptions: ['user://profile'] });

				// Bun.serve's OLD default idleTimeout is 10 seconds; waiting
				// past it without the connection being severed is the
				// regression proof.
				await Bun.sleep(12_000);

				// A still-open subscription can still be closed cleanly -- if
				// the server had already killed the connection, this would
				// either throw or the stream would already be in a closed
				// state the SDK surfaces as an error here.
				await subscription.close();
				await client.close();
			} finally {
				if (!subprocess.killed) subprocess.kill('SIGKILL');
				await subprocess.exited;
			}
		}, 30_000);
	},
);
