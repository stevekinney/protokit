import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMcpServer } from './server.js';
import { mcpScopes } from './scopes.js';
import type { McpUserProfile } from './types/primitives.js';
import { templateRegistry } from './template-registry.js';

/**
 * AUTHZ-001: wire-level proof that a token's granted scopes actually gate
 * `tools/call`, `resources/read`, and `prompts/get` — not just that
 * `requiredScope` is declared in the registry (`metadata-contract.test.ts`
 * covers that half). Drives a real in-process `Client` against a real
 * `McpServer`, the same harness META-001 established, rather than calling
 * `server.ts`'s internal wrapping functions directly.
 */

function scopeTestUser(userId: string): McpUserProfile {
	return {
		id: userId,
		email: 'scope-enforcement@localhost',
		name: 'Scope Enforcement User',
		image: null,
		role: 'user',
	};
}

async function connectedClientWithScopes(scopes: readonly string[]): Promise<Client> {
	const handler = createMcpHandler(
		() => {
			const userId = randomUUID();
			return createMcpServer(
				{
					userId,
					user: scopeTestUser(userId),
					enableUiExtension: false,
					enableConformanceMode: false,
					scopes,
				},
				templateRegistry,
			);
		},
		{ legacy: 'stateless' },
	);
	const client = new Client({ name: 'scope-enforcement-client', version: '1.0.0' });
	const transport = new StreamableHTTPClientTransport(
		new URL('http://scope-enforcement.local/mcp'),
		{
			fetch: (input, init) => handler.fetch(new Request(input, init)),
		},
	);
	await client.connect(transport);
	return client;
}

describe('tool scope enforcement', () => {
	it('lists get_user_profile regardless of granted scopes', async () => {
		const client = await connectedClientWithScopes([]);
		const tools = await client.listTools();
		expect(tools.tools.some((tool) => tool.name === 'get_user_profile')).toBe(true);
		await client.close();
	});

	it('answers a call with a granted scope normally', async () => {
		const client = await connectedClientWithScopes(['profile:read']);
		const result = await client.callTool({ name: 'get_user_profile', arguments: {} });
		expect(result.isError).not.toBe(true);
		expect(result.structuredContent).toBeDefined();
		await client.close();
	});

	it('refuses a call missing the required scope with an isError result carrying the challenge', async () => {
		const client = await connectedClientWithScopes([]);
		const result = await client.callTool({ name: 'get_user_profile', arguments: {} });
		expect(result.isError).toBe(true);
		expect(result.structuredContent).toBeUndefined();
		expect((result._meta as Record<string, unknown> | undefined)?.['mcp/www_authenticate']).toBe(
			'Bearer error="insufficient_scope", scope="profile:read"',
		);
		await client.close();
	});

	it('refuses a call when only an unrelated scope is granted', async () => {
		const client = await connectedClientWithScopes(['prompts:read']);
		const result = await client.callTool({ name: 'get_user_profile', arguments: {} });
		expect(result.isError).toBe(true);
		await client.close();
	});
});

describe('resource scope enforcement', () => {
	it('reads user://profile with a granted scope', async () => {
		const client = await connectedClientWithScopes(['profile:read']);
		const result = await client.readResource({ uri: 'user://profile' });
		expect(result.contents.length).toBeGreaterThan(0);
		await client.close();
	});

	it('rejects reading user://profile without profile:read, carrying the challenge in the error data', async () => {
		const client = await connectedClientWithScopes([]);
		await expect(client.readResource({ uri: 'user://profile' })).rejects.toMatchObject({
			code: -32003,
			data: expect.objectContaining({
				requiredScope: 'profile:read',
				_meta: {
					'mcp/www_authenticate': 'Bearer error="insufficient_scope", scope="profile:read"',
				},
			}),
		});
		await client.close();
	});
});

describe('prompt scope enforcement', () => {
	it('gets the summarize prompt with a granted scope', async () => {
		const client = await connectedClientWithScopes(['prompts:read']);
		const result = await client.getPrompt({ name: 'summarize', arguments: { topic: 'oauth' } });
		expect(result.messages.length).toBeGreaterThan(0);
		await client.close();
	});

	it('rejects getting the summarize prompt without prompts:read, carrying the challenge in the error data', async () => {
		const client = await connectedClientWithScopes([]);
		await expect(
			client.getPrompt({ name: 'summarize', arguments: { topic: 'oauth' } }),
		).rejects.toMatchObject({
			code: -32003,
			data: expect.objectContaining({
				requiredScope: 'prompts:read',
				_meta: {
					'mcp/www_authenticate': 'Bearer error="insufficient_scope", scope="prompts:read"',
				},
			}),
		});
		await client.close();
	});
});

describe('conformance-only scope', () => {
	it('audit:read gates list_audit_events only when conformance mode is on', async () => {
		const handler = createMcpHandler(
			() => {
				const userId = randomUUID();
				return createMcpServer(
					{
						userId,
						user: scopeTestUser(userId),
						enableUiExtension: false,
						enableConformanceMode: true,
						scopes: mcpScopes,
					},
					templateRegistry,
				);
			},
			{ legacy: 'stateless' },
		);
		const client = new Client({ name: 'audit-scope-client', version: '1.0.0' });
		const transport = new StreamableHTTPClientTransport(
			new URL('http://audit-scope-enforcement.local/mcp'),
			{ fetch: (input, init) => handler.fetch(new Request(input, init)) },
		);
		await client.connect(transport);

		const result = await client.callTool({ name: 'list_audit_events', arguments: {} });
		expect(result.isError).not.toBe(true);

		await client.close();
	});

	it('is refused, with the challenge, when conformance mode is on but audit:read was not granted', async () => {
		const handler = createMcpHandler(
			() => {
				const userId = randomUUID();
				return createMcpServer(
					{
						userId,
						user: scopeTestUser(userId),
						enableUiExtension: false,
						enableConformanceMode: true,
						scopes: ['profile:read', 'prompts:read'],
					},
					templateRegistry,
				);
			},
			{ legacy: 'stateless' },
		);
		const client = new Client({ name: 'audit-scope-denied-client', version: '1.0.0' });
		const transport = new StreamableHTTPClientTransport(
			new URL('http://audit-scope-denied.local/mcp'),
			{ fetch: (input, init) => handler.fetch(new Request(input, init)) },
		);
		await client.connect(transport);

		const result = await client.callTool({ name: 'list_audit_events', arguments: {} });
		expect(result.isError).toBe(true);
		expect((result._meta as Record<string, unknown> | undefined)?.['mcp/www_authenticate']).toBe(
			'Bearer error="insufficient_scope", scope="audit:read"',
		);

		await client.close();
	});
});
