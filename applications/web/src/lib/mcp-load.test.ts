import { describe, expect, it, mock } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { AuthInfo } from '@modelcontextprotocol/server';

/**
 * `bun run test:mcp-load` (named in `PROTO-002`'s verification block).
 *
 * Not a throughput benchmark — a correctness-under-concurrency check for
 * the two things this item's acceptance criteria call out directly:
 * "repeated list calls return deterministic ordering" and a
 * "target-host-compatible execution budget without increasing timeout or
 * retry limits to hide slow work." Concurrency also exercises
 * `McpUserHandlerCache` (PROTO-002 / S-11) under real multi-user load
 * rather than only the single- and two-user cases the other test files
 * cover.
 */

mock.module('@web/env', () => ({
	environment: {
		MCP_ENABLE_UI_EXTENSION: false,
		MCP_CONFORMANCE_MODE: false,
		PROTOKIT_TUNNEL_ACTIVE: false,
	},
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => [
						{
							id: 'load-user',
							email: 'load@example.com',
							name: 'Load User',
							image: null,
							role: 'user',
						},
					],
				}),
			}),
		}),
	},
	schema: {
		users: { id: 'id', email: 'email', name: 'name', image: 'image', role: 'role' },
	},
}));

mock.module('drizzle-orm', () => ({
	eq: (column: unknown, value: unknown) => ({ column, value }),
}));

const { handleMcpRequest } = await import('@web/lib/mcp-handler');

const grantedScopes = ['profile:read', 'audit:read', 'prompts:read'];

function buildAuthInfo(userId: string): AuthInfo {
	return {
		token: 'load-test-token',
		clientId: 'load-test-client',
		scopes: grantedScopes,
		resource: new URL('http://localhost:3000/mcp'),
		extra: {
			userId,
			oauthClientId: 'load-test-client',
			scopes: grantedScopes,
			resource: 'http://localhost:3000/mcp',
		},
	};
}

function makeFetch(userId: string) {
	return async (input: string | URL, init?: RequestInit): Promise<Response> =>
		handleMcpRequest(new Request(input, init), buildAuthInfo(userId));
}

async function connectClient(userId: string, name: string): Promise<Client> {
	const client = new Client({ name, version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
	const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
		fetch: makeFetch(userId),
	});
	await client.connect(transport);
	return client;
}

describe('MCP load: concurrent multi-user execution', () => {
	it('returns identical tools/list ordering across many concurrent users and repeated calls', async () => {
		const userCount = 20;
		const callsPerUser = 5;

		const clients = await Promise.all(
			Array.from({ length: userCount }, (_, index) =>
				connectClient(`load-user-${index}`, `load-client-${index}`),
			),
		);

		const orderings = await Promise.all(
			clients.flatMap((client) =>
				Array.from({ length: callsPerUser }, async () => {
					const result = await client.listTools();
					return result.tools.map((tool) => tool.name);
				}),
			),
		);

		const first = orderings[0];
		expect(first).toBeDefined();
		expect(first!.length).toBeGreaterThan(0);
		for (const ordering of orderings) {
			expect(ordering).toEqual(first);
		}

		await Promise.all(clients.map((client) => client.close()));
	});

	it('a burst of concurrent tool calls across many users completes within a bounded time budget', async () => {
		const userCount = 30;
		const clients = await Promise.all(
			Array.from({ length: userCount }, (_, index) =>
				connectClient(`load-burst-user-${index}`, `load-burst-client-${index}`),
			),
		);

		const start = Date.now();
		const results = await Promise.all(
			clients.map((client) => client.callTool({ name: 'get_user_profile', arguments: {} })),
		);
		const elapsedMs = Date.now() - start;

		for (const result of results) {
			expect(Boolean(result.isError)).toBe(false);
		}
		// Generous bound for a fully in-process, no-network-I/O suite — this
		// is a regression guard against something becoming accidentally
		// serialized or quadratic under concurrency, not a strict SLA.
		expect(elapsedMs).toBeLessThan(10_000);

		await Promise.all(clients.map((client) => client.close()));
	});
});
