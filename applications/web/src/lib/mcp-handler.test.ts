import { describe, expect, it, mock } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { AuthInfo } from '@modelcontextprotocol/server';

mock.module('@web/env', () => ({
	environment: {
		MCP_ENABLE_UI_EXTENSION: false,
		MCP_ENABLE_ENTERPRISE_AUTH: false,
		MCP_CONFORMANCE_MODE: false,
	},
}));

mock.module('@template/database', () => ({
	database: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => [
						{
							id: 'user-1',
							email: 'user@example.com',
							name: 'Test User',
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

function buildAuthInfo(): AuthInfo {
	return {
		token: 'test-token',
		clientId: 'client-1',
		scopes: ['mcp:read'],
		resource: new URL('http://localhost:3000/mcp'),
		extra: {
			userId: 'user-1',
			oauthClientId: 'client-1',
			scopes: ['mcp:read'],
			resource: 'http://localhost:3000/mcp',
		},
	};
}

async function fetchThroughHandler(input: string | URL, init?: RequestInit): Promise<Response> {
	return handleMcpRequest(new Request(input, init), buildAuthInfo());
}

describe('handleMcpRequest', () => {
	it('serves a 2025-11-25 (legacy) client through the SDK stateless fallback', async () => {
		const client = new Client({ name: 'legacy-test-client', version: '1.0.0' });
		const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
			fetch: fetchThroughHandler,
		});

		await client.connect(transport);
		expect(client.getProtocolEra()).toBe('legacy');

		const tools = await client.listTools();
		expect(tools.tools.some((tool) => tool.name === 'get_user_profile')).toBe(true);

		await client.close();
	});

	it('serves a 2026-07-28 (modern) client via server/discover with no session state', async () => {
		const client = new Client(
			{ name: 'modern-test-client', version: '1.0.0' },
			{ versionNegotiation: { mode: 'auto' } },
		);
		const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
			fetch: fetchThroughHandler,
		});

		await client.connect(transport);
		expect(client.getProtocolEra()).toBe('modern');

		const tools = await client.listTools();
		expect(tools.tools.some((tool) => tool.name === 'get_user_profile')).toBe(true);

		const result = await client.callTool({ name: 'get_user_profile', arguments: {} });
		expect(Boolean(result.isError)).toBe(false);

		await client.close();
	});

	it('rejects a modern request whose MCP-Protocol-Version header does not match its envelope', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'mcp-method': 'tools/list',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/list',
				params: {
					_meta: {
						'io.modelcontextprotocol/protocolVersion': '2026-07-28',
					},
				},
			}),
		});

		expect(response.status).toBe(400);
	});

	it('rejects a modern tools/call request missing the required Mcp-Method header', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'mcp-protocol-version': '2026-07-28',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/list',
				params: {
					_meta: {
						'io.modelcontextprotocol/protocolVersion': '2026-07-28',
						'io.modelcontextprotocol/clientCapabilities': {},
					},
				},
			}),
		});

		expect(response.status).toBe(400);
	});

	it('rejects a modern tools/call request whose Mcp-Name disagrees with the body', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'mcp-protocol-version': '2026-07-28',
				'mcp-method': 'tools/call',
				'mcp-name': 'wrong_tool_name',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'get_user_profile',
					arguments: {},
					_meta: {
						'io.modelcontextprotocol/protocolVersion': '2026-07-28',
						'io.modelcontextprotocol/clientCapabilities': {},
					},
				},
			}),
		});

		expect(response.status).toBe(400);
	});

	it('rejects a JSON-RPC batch on the modern path', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'mcp-protocol-version': '2026-07-28',
			},
			body: JSON.stringify([
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/list',
					params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
				},
			]),
		});

		expect(response.status).toBeGreaterThanOrEqual(400);
	});

	it('answers a bare notification POST with 202 and an empty body', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'notifications/initialized',
			}),
		});

		expect(response.status).toBe(202);
		expect(await response.text()).toBe('');
	});

	it('rejects a declared oversized Content-Length before ever reaching the SDK, with a stable protocol error', async () => {
		const response = await fetchThroughHandler('http://localhost:3000/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'content-length': String(10 * 1024 * 1024), // 10MB, well over the 1MB limit
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		});

		expect(response.status).toBe(413);
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe('payload_too_large');
	});

	it('fails a chunked body (no Content-Length) that overflows the limit while streaming, with a stable SDK-produced protocol error', async () => {
		// No `content-length` header at all — this is the chunked-transfer
		// case. `boundRequestBody`'s streaming cap still fires once the byte
		// count crosses the limit; the SDK converts the resulting stream
		// error into its own JSON-RPC parse-error response rather than ever
		// calling the (database-touching) server factory.
		const encoder = new TextEncoder();
		const oversizedChunk = encoder.encode(
			`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"padding":"${'x'.repeat(2 * 1024 * 1024)}"}}`,
		);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(oversizedChunk);
				controller.close();
			},
		});
		const response = await handleMcpRequest(
			new Request('http://localhost:3000/mcp', {
				method: 'POST',
				headers: {
					accept: 'application/json, text/event-stream',
					'content-type': 'application/json',
				},
				body: stream,
				duplex: 'half',
			} as RequestInit),
			buildAuthInfo(),
		);

		expect(response.status).toBeGreaterThanOrEqual(400);
		const body = (await response.json()) as { jsonrpc: string; error?: { code: number } };
		expect(body.jsonrpc).toBe('2.0');
		expect(typeof body.error).toBe('object');
	});
});
