import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMcpServer } from './server.js';
import type { McpUserProfile } from './types/primitives.js';

function conformanceUser(userId: string): McpUserProfile {
	return {
		id: userId,
		email: 'conformance@localhost',
		name: 'Conformance User',
		image: null,
		role: 'user',
	};
}

const handler = createMcpHandler(
	() => {
		const userId = randomUUID();
		return createMcpServer({
			userId,
			user: conformanceUser(userId),
			enableUiExtension: false,
			enableEnterpriseAuthorizationExtension: false,
			enableConformanceMode: false,
		});
	},
	{ legacy: 'stateless' },
);

async function fetchThroughHandler(input: string | URL, init?: RequestInit): Promise<Response> {
	return handler.fetch(new Request(input, init));
}

describe('MCP 2026-07-28 (modern) conformance', () => {
	it('negotiates the modern era via server/discover with no session state', async () => {
		const client = new Client(
			{ name: 'modern-conformance-client', version: '1.0.0' },
			{ versionNegotiation: { mode: 'auto' } },
		);
		const transport = new StreamableHTTPClientTransport(new URL('http://conformance.local/mcp'), {
			fetch: fetchThroughHandler,
		});

		await client.connect(transport);
		expect(client.getProtocolEra()).toBe('modern');

		await client.close();
	});

	it('lists capabilities and invokes a tool without an initialization handshake', async () => {
		const client = new Client(
			{ name: 'modern-conformance-client', version: '1.0.0' },
			{ versionNegotiation: { mode: { pin: '2026-07-28' } } },
		);
		const transport = new StreamableHTTPClientTransport(new URL('http://conformance.local/mcp'), {
			fetch: fetchThroughHandler,
		});

		await client.connect(transport);

		const tools = await client.listTools();
		expect(tools.tools.some((tool) => tool.name === 'get_user_profile')).toBe(true);

		const result = await client.callTool({ name: 'get_user_profile', arguments: {} });
		expect(Boolean(result.isError)).toBe(false);

		await client.close();
	});

	it('rejects a JSON-RPC batch on the modern path', async () => {
		const response = await fetchThroughHandler('http://conformance.local/mcp', {
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

	it('answers a notification POST with 202 and an empty body', async () => {
		const response = await fetchThroughHandler('http://conformance.local/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
			},
			body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
		});

		expect(response.status).toBe(202);
		expect(await response.text()).toBe('');
	});

	it('rejects a request whose MCP-Protocol-Version header disagrees with its envelope', async () => {
		const response = await fetchThroughHandler('http://conformance.local/mcp', {
			method: 'POST',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'mcp-protocol-version': '2025-11-25',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/list',
				params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
			}),
		});

		expect(response.status).toBe(400);
	});
});
