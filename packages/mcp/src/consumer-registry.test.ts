import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMcpServer } from './server.js';
import { getSupportedScopes } from './supported-scopes.js';
import { defineScopes } from './scope-vocabulary.js';
import type { McpRegistry } from './scope-vocabulary.js';
import type { McpUserProfile } from './types/primitives.js';

/**
 * A second consumer, defined entirely here. Nothing in this file imports
 * `allTools`, `mcpScopes`, or `templateRegistry` — that is the point. If any
 * of these tests could only pass by reaching for this package's own
 * primitives, the package would still not be consumable as a library.
 */
const consumerVocabulary = defineScopes({
	'repositories:read': 'Read repository metadata.',
	'conformance:read': 'Conformance fixtures only, never real data.',
});

const echoTool = consumerVocabulary.defineTool({
	name: 'echo_repository',
	title: 'Echo repository',
	description: 'A consumer-defined production tool.',
	inputSchema: z.object({ name: z.string() }),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	requiredScope: 'repositories:read',
	handler: async (input) => ({ content: [{ type: 'text', text: `repo:${input.name}` }] }),
});

const fixtureTool = consumerVocabulary.defineTool({
	name: 'consumer_fixture',
	title: 'Consumer fixture',
	description: 'A consumer-defined conformance-only fixture.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	requiredScope: 'conformance:read',
	handler: async () => ({ content: [{ type: 'text', text: 'synthetic' }] }),
});

const consumerRegistry: McpRegistry<'repositories:read' | 'conformance:read'> = {
	tools: [echoTool],
	resources: [],
	prompts: [],
	conformanceOnlyTools: [fixtureTool],
};

function consumerUser(userId: string): McpUserProfile {
	return {
		id: userId,
		email: 'consumer@localhost',
		name: 'Consumer User',
		image: null,
		role: 'user',
	};
}

function connect(scopes: readonly string[]): Promise<Client> {
	const handler = createMcpHandler(
		() => {
			const userId = randomUUID();
			return createMcpServer(
				{
					userId,
					user: consumerUser(userId),
					enableUiExtension: false,
					enableConformanceMode: false,
					scopes,
				},
				consumerRegistry,
			);
		},
		{ legacy: 'stateless' },
	);
	const client = new Client({ name: 'consumer-registry-client', version: '1.0.0' });
	const transport = new StreamableHTTPClientTransport(new URL('http://consumer.local/mcp'), {
		fetch: (input, init) => handler.fetch(new Request(input, init)),
	});
	return client.connect(transport).then(() => client);
}

describe('a consumer-supplied registry', () => {
	it('advertises the consumer’s own tool and lets it be called', async () => {
		const client = await connect(getSupportedScopes(consumerRegistry));

		const listed = await client.listTools();
		expect(listed.tools.map((tool) => tool.name)).toEqual(['echo_repository']);

		const result = await client.callTool({
			name: 'echo_repository',
			arguments: { name: 'tribunal' },
		});
		expect(result.content).toEqual([{ type: 'text', text: 'repo:tribunal' }]);
	});

	it('never advertises a conformance-only tool in production mode', async () => {
		const client = await connect(getSupportedScopes(consumerRegistry));
		const listed = await client.listTools();
		expect(listed.tools.map((tool) => tool.name)).not.toContain('consumer_fixture');
	});
});

describe('getSupportedScopes against a consumer registry', () => {
	it('derives the consumer’s vocabulary rather than this package’s', () => {
		expect(getSupportedScopes(consumerRegistry)).toEqual(['repositories:read']);
	});

	/**
	 * The exclusion is structural — `getSupportedScopes` walks the production
	 * three and never `conformanceOnlyTools`. This asserts the property rather
	 * than the mechanism, so it stays honest if the implementation changes,
	 * and it fails the moment the walk is widened or replaced by a hardcoded
	 * exclusion list that happens not to name this consumer's scope.
	 */
	it('excludes a scope declared only by a conformance-only tool', () => {
		expect(getSupportedScopes(consumerRegistry)).not.toContain('conformance:read');

		const asProduction: McpRegistry<'repositories:read' | 'conformance:read'> = {
			...consumerRegistry,
			tools: [echoTool, fixtureTool],
			conformanceOnlyTools: [],
		};
		// The same scope IS advertised once the same tool is production —
		// proving the exclusion tracks which registry a primitive is in, not
		// the scope's name.
		expect(getSupportedScopes(asProduction)).toContain('conformance:read');
	});
});

describe('scope enforcement against a consumer vocabulary', () => {
	/**
	 * AUTHZ-001: widening happens only on the declaration side. Granted scopes
	 * stay `readonly string[]` and the check is exact membership, so there is
	 * no value a client can present that authorizes everything.
	 */
	it('treats a wildcard grant as authorizing nothing', async () => {
		const client = await connect(['*']);
		const result = await client.callTool({
			name: 'echo_repository',
			arguments: { name: 'tribunal' },
		});
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result.content)).toContain('repositories:read');
	});

	it('allows the call once the exact scope is granted', async () => {
		const client = await connect(['repositories:read']);
		const result = await client.callTool({
			name: 'echo_repository',
			arguments: { name: 'tribunal' },
		});
		expect(result.isError).toBeFalsy();
	});
});

describe('the vocabulary itself', () => {
	it('narrows against the consumer’s own set, not this package’s', () => {
		expect(consumerVocabulary.isScope('repositories:read')).toBe(true);
		expect(consumerVocabulary.isScope('profile:read')).toBe(false);
		expect(consumerVocabulary.isScope('*')).toBe(false);
	});

	it('carries a description for every scope, because descriptions declare it', () => {
		for (const scope of consumerVocabulary.scopes) {
			expect(consumerVocabulary.descriptions[scope]).toBeTruthy();
		}
	});
});
