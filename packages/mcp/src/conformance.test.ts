import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { createConsumerConformanceHandler, runMcpConformance } from './conformance.js';
import { defineScopes } from './scope-vocabulary.js';

const vocabulary = defineScopes({ 'fixtures:read': 'Read test-owned fixtures.' });

const healthyTool = vocabulary.defineTool({
	name: 'healthy_fixture',
	title: 'Healthy fixture',
	description: 'Returns a conforming MCP tool result.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	requiredScope: 'fixtures:read',
	handler: async () => ({ content: [{ type: 'text', text: 'healthy' }] }),
});

const brokenTool = vocabulary.defineTool({
	name: 'broken_fixture',
	title: 'Broken fixture',
	description: 'Deliberately returns an MCP error for the conformance test.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	requiredScope: 'fixtures:read',
	handler: async () => ({
		isError: true,
		content: [{ type: 'text', text: 'deliberately broken' }],
	}),
});

const registry = vocabulary.defineRegistry({
	tools: [healthyTool, brokenTool],
	resources: [],
	prompts: [],
});

describe('consumer conformance harness', () => {
	it('reports one deliberately broken modern behavior by stable name while the others pass', async () => {
		const results = await runMcpConformance({
			era: 'modern',
			registry,
			scopeVocabulary: vocabulary,
			toolProbes: {
				healthy_fixture: {},
				broken_fixture: {},
			},
		});

		expect(results.map(({ name, status }) => ({ name, status }))).toEqual([
			{ name: 'connection', status: 'passed' },
			{ name: 'tools/list', status: 'passed' },
			{ name: 'tools/call:broken_fixture', status: 'failed' },
			{ name: 'tools/call:healthy_fixture', status: 'passed' },
		]);
	});

	it('exercises the legacy era against the same test-defined registry', async () => {
		const results = await runMcpConformance({
			era: 'legacy',
			registry,
			scopeVocabulary: vocabulary,
			toolProbes: { healthy_fixture: {} },
		});

		expect(results.every((result) => result.status === 'passed')).toBe(true);
		expect(results.map((result) => result.name)).toEqual([
			'connection',
			'tools/list',
			'tools/call:healthy_fixture',
		]);
	});

	for (const enableConformanceMode of [false, true]) {
		it(`rejects DNS-rebinding headers when conformance mode is ${String(enableConformanceMode)}`, async () => {
			const handler = createConsumerConformanceHandler({
				registry,
				scopeVocabulary: vocabulary,
				enableConformanceMode,
			});
			const response = await handler.fetch(
				new Request('http://attacker.example/mcp', {
					method: 'POST',
					headers: {
						host: 'attacker.example',
						origin: 'https://attacker.example',
					},
				}),
			);

			expect(response.status).toBe(403);
		});
	}
});
