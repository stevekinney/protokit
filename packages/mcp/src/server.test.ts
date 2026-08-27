import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'bun:test';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { areResourceSubscriptionsAuthorized, createMcpServer } from './server';
import { getSupportedScopes } from './supported-scopes.js';
import { templateRegistry } from './template-registry.js';

describe('createMcpServer', () => {
	it('returns a defined server instance', () => {
		const server = createMcpServer(
			{
				userId: 'test-user-id',
				user: {
					id: 'test-user-id',
					email: 'test@example.com',
					name: 'Test User',
					image: null,
					role: 'user',
				},
				enableUiExtension: true,
				enableConformanceMode: false,
				scopes: ['profile:read'],
			},
			templateRegistry,
		);
		expect(server).toBeDefined();
	});

	/**
	 * The `isError`/"tool failure" logging branch in `registerToolDefinition`
	 * (the `if (isError) { logger.warn(...) }` block) only fires for a
	 * GRANTED-scope call whose handler itself returns `isError: true` --
	 * distinct from the insufficient-scope path `scope-enforcement.test.ts`
	 * already covers. `get_user_profile` returns
	 * `createToolStructuredResponse(context.user, ...)`, which itself
	 * returns `isError: true` when the generated summary exceeds
	 * `tool-response.ts`'s 256KB bound -- a real, legitimate way to make a
	 * production tool fail without mocking anything, just an oversized
	 * profile name on the authenticated user this server was constructed
	 * for.
	 */
	it('logs and records a tool_failure outcome when a granted-scope call returns isError from its own handler', async () => {
		const userId = randomUUID();
		const server = createMcpServer(
			{
				userId,
				user: {
					id: userId,
					email: 'test@example.com',
					name: 'x'.repeat(300 * 1024),
					image: null,
					role: 'user',
				},
				enableUiExtension: false,
				enableConformanceMode: false,
				scopes: getSupportedScopes(templateRegistry),
			},
			templateRegistry,
		);
		const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
		const client = new Client({ name: 'tool-failure-client', version: '1.0.0' });
		await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

		const result = await client.callTool({ name: 'get_user_profile', arguments: {} });
		expect(result.isError).toBe(true);

		await client.close();
	});
});

/**
 * Regression coverage for the round-seventeen review finding: a
 * `subscriptions/listen` request naming `resourceSubscriptions: ['user://profile']`
 * (which requires `profile:read`) must be denied for a caller holding only
 * `prompts:read` — the exact scenario the report describes (a client that
 * later receives a `resource_updated` event for a resource it was never
 * granted read access to).
 */
describe('areResourceSubscriptionsAuthorized', () => {
	it('authorizes a URI whose resource requires a scope the caller holds', () => {
		expect(
			areResourceSubscriptionsAuthorized(['user://profile'], ['profile:read'], templateRegistry),
		).toBe(true);
	});

	it('denies a URI whose resource requires a scope the caller lacks (the reported bypass)', () => {
		expect(
			areResourceSubscriptionsAuthorized(['user://profile'], ['prompts:read'], templateRegistry),
		).toBe(false);
	});

	it('denies when the caller holds no scopes at all', () => {
		expect(areResourceSubscriptionsAuthorized(['user://profile'], [], templateRegistry)).toBe(
			false,
		);
	});

	it('fails closed for a URI that names no known resource, without disclosing that distinctly', () => {
		expect(
			areResourceSubscriptionsAuthorized(
				['user://does-not-exist'],
				['profile:read', 'prompts:read'],
				templateRegistry,
			),
		).toBe(false);
	});

	it('denies the whole request when only one of several requested URIs is under-scoped', () => {
		expect(
			areResourceSubscriptionsAuthorized(
				['user://profile', 'user://does-not-exist'],
				['profile:read'],
				templateRegistry,
			),
		).toBe(false);
	});

	it('authorizes an empty subscription list vacuously', () => {
		expect(areResourceSubscriptionsAuthorized([], [], templateRegistry)).toBe(true);
	});
});
