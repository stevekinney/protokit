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
			enableConformanceMode: false,
		});
	},
	{ legacy: 'stateless' },
);

async function fetchThroughHandler(input: string | URL, init?: RequestInit): Promise<Response> {
	return handler.fetch(new Request(input, init));
}

describe('MCP 2025-11-25 (legacy) conformance', () => {
	it('connects a Claude-compatible client through the SDK legacy handshake', async () => {
		const client = new Client({ name: 'legacy-conformance-client', version: '1.0.0' });
		const transport = new StreamableHTTPClientTransport(new URL('http://conformance.local/mcp'), {
			fetch: fetchThroughHandler,
		});

		await client.connect(transport);
		expect(client.getProtocolEra()).toBe('legacy');

		await client.close();
	});

	it('lists capabilities and invokes a tool over the stateless legacy fallback', async () => {
		const client = new Client({ name: 'legacy-conformance-client', version: '1.0.0' });
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
});
