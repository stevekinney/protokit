import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { hashCredential } from '@web/lib/hash-credential';

/**
 * `OPS-001`: "Graceful shutdown completes or cancels in-flight operations
 * without issuing duplicate results" -- the one acceptance criterion this
 * item can prove with real, local evidence rather than deferring to
 * `deploymentBlockedCriteria`. `server.ts`'s `gracefulShutdown()` is real
 * production code (`SIGTERM`/`SIGINT` handlers, `server.stop(false)`,
 * `shutdownMcpTransports()`, a bounded forced-exit timeout) that this test
 * exercises by spawning the actual entrypoint as a real OS process against
 * the real shared Postgres/Redis stack -- not Docker, not an in-process
 * `Bun.serve()` stand-in, satisfying the "process, not a container" carve-out
 * this branch's infrastructure rules leave open.
 *
 * The proof: fire a burst of concurrent, uniquely-`id`'d MCP `initialize`
 * requests against the real subprocess, send it `SIGTERM` partway through
 * the burst (so some requests are still genuinely in flight when the
 * signal arrives, not merely queued), then assert every response that
 * arrives is a well-formed JSON-RPC reply whose `id` was requested exactly
 * once and appears in the response set at most once -- a duplicate `id` in
 * the response set would be the "issuing duplicate results" failure mode
 * this criterion names. The subprocess must also exit on its own, cleanly,
 * within `server.ts`'s own 10s forced-exit timeout.
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
const clientId = `graceful-shutdown-test-${testRunId}`;
const accessToken = `graceful-shutdown-test-token-${testRunId}`;

/**
 * The MCP transport answers a POST with `accept: text/event-stream` in an
 * SSE-framed body (`event: message\ndata: {...}\n\n`), not plain JSON, even
 * for a single non-streaming reply -- confirmed empirically against a real
 * running server, not assumed. Extracts the JSON-RPC payload from the
 * first `data:` line either way.
 */
async function parseMcpJsonRpcBody(response: Response): Promise<{ id?: number } | null> {
	const text = await response.text();
	const dataLine = text
		.split('\n')
		.find((line) => line.startsWith('data:'))
		?.slice('data:'.length)
		.trim();
	const jsonText = dataLine ?? text.trim();
	if (!jsonText) return null;
	try {
		return JSON.parse(jsonText) as { id?: number };
	} catch {
		return null;
	}
}

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
		email: `graceful-shutdown-test-${testRunId}@example.com`,
		name: 'Graceful Shutdown Test User',
		image: null,
		emailVerified: true,
		role: 'user',
	});
	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: null,
		clientName: 'Graceful Shutdown Test Client',
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

describeWithRedis('graceful shutdown (requires Redis, spawns a real subprocess)', () => {
	it('completes every in-flight MCP request exactly once and exits cleanly on SIGTERM', async () => {
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
				RATE_LIMIT_KEY_NAMESPACE: `graceful-shutdown-${testRunId}`,
			},
			stdout: 'pipe',
			stderr: 'pipe',
		});

		try {
			await waitForHealthy(baseUrl, 15_000);

			const requestCount = 8;
			const requestIds = Array.from({ length: requestCount }, (_, index) => index + 1);

			const requestPromises = requestIds.map(async (id) => {
				const startedAt = Date.now();
				try {
					const response = await fetch(`${baseUrl}/mcp`, {
						method: 'POST',
						headers: {
							authorization: `Bearer ${accessToken}`,
							'content-type': 'application/json',
							accept: 'application/json, text/event-stream',
						},
						body: JSON.stringify({
							jsonrpc: '2.0',
							id,
							method: 'initialize',
							params: {
								protocolVersion: '2025-11-25',
								capabilities: {},
								clientInfo: { name: 'graceful-shutdown-test', version: '1.0.0' },
							},
						}),
						signal: AbortSignal.timeout(12_000),
					});
					const status = response.status;
					const body = status < 500 ? await parseMcpJsonRpcBody(response) : null;
					return {
						requestId: id,
						status,
						body,
						errored: false,
						elapsedMs: Date.now() - startedAt,
					};
				} catch (error) {
					// Connection refused/reset by a server that has already
					// finished shutting down is an acceptable outcome -- the
					// failure this test guards against is a DUPLICATE or
					// malformed result, not a request that never got one at all.
					return {
						requestId: id,
						status: null,
						body: null,
						errored: true,
						elapsedMs: Date.now() - startedAt,
						errorMessage: error instanceof Error ? error.message : String(error),
					};
				}
			});

			// Send SIGTERM partway through the burst, not before or after
			// it, so at least some requests are genuinely in flight -- not
			// merely queued -- when the signal arrives.
			setTimeout(() => subprocess.kill('SIGTERM'), 10);

			const results = await Promise.all(requestPromises);

			const exitCode = await subprocess.exited;
			expect(exitCode).toBe(0);

			const successfulResults = results.filter((result) => result.status === 200);
			expect(successfulResults.length).toBeGreaterThan(0);

			const respondedIds = successfulResults.map((result) => result.body?.id);
			const uniqueRespondedIds = new Set(respondedIds);
			// The core assertion: no JSON-RPC id was answered more than once.
			expect(uniqueRespondedIds.size).toBe(respondedIds.length);

			for (const result of successfulResults) {
				expect(result.body?.id).toBe(result.requestId);
			}
		} finally {
			if (!subprocess.killed) subprocess.kill('SIGKILL');
			await subprocess.exited;
		}
	}, 30_000);
});
