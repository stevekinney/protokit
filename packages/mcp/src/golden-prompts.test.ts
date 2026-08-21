import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { allTools } from './tools/index.js';
import { allResources } from './resources/index.js';
import { allPrompts } from './prompts/index.js';
import { goldenPrompts, type GoldenPromptCategory } from './golden-prompts.js';

/**
 * DIST-002: proves the golden-prompt evaluation set stays in sync with the
 * actual production registry — every referenced operation is real, every
 * referenced parameter is real, `list_audit_events` (conformance-only) is
 * never treated as an available production tool, and every category the
 * ChatGPT review process asks for has at least one case. This cannot prove
 * a real model behaves as `expectedBehavior` describes — that requires a
 * live ChatGPT connection, which is deployment-blocked (see
 * `CHATGPT-REVIEW.md`) — it proves the specification itself is accurate and
 * complete relative to the server it describes.
 */

const productionToolNames = new Set(allTools.map((tool) => tool.name));
const productionResourceNames = new Set(allResources.map((resource) => resource.name));
const productionPromptNames = new Set(allPrompts.map((prompt) => prompt.name));

/**
 * Derived from the real tool/prompt definitions, never hand-duplicated —
 * a parameter renamed or added on a tool/prompt automatically changes what
 * this test accepts, so the golden-prompt set can't silently drift.
 */
const realParameterNamesByOperation: Record<string, readonly string[]> = Object.fromEntries([
	...allTools.map((tool) => [
		tool.name,
		tool.inputSchema instanceof z.ZodObject ? Object.keys(tool.inputSchema.shape) : [],
	]),
	...allResources.map((resource) => [resource.name, []]),
	...allPrompts.map((prompt) => [prompt.name, Object.keys(prompt.arguments ?? {})]),
]);

const requiredCategories: readonly GoldenPromptCategory[] = [
	'intended-tool-use',
	'disallowed-tool-use',
	'parameter-extraction',
	'authentication-interruption',
	'untrusted-content-handling',
];

describe('golden-prompt evaluation set', () => {
	it('covers every required review category with at least one case', () => {
		for (const category of requiredCategories) {
			const count = goldenPrompts.filter((entry) => entry.category === category).length;
			expect(count).toBeGreaterThan(0);
		}
	});

	it('every referenced operation exists in the production registry', () => {
		for (const entry of goldenPrompts) {
			if (entry.operation === null) continue;
			const isRealOperation =
				productionToolNames.has(entry.operation) ||
				productionResourceNames.has(entry.operation) ||
				productionPromptNames.has(entry.operation);
			expect(isRealOperation).toBe(true);
		}
	});

	it('never treats a conformance-only fixture as an available production operation', () => {
		for (const entry of goldenPrompts) {
			expect(entry.operation).not.toBe('list_audit_events');
		}
		// list_audit_events must genuinely be absent from the production
		// registry this set is checked against, not merely unreferenced.
		expect(productionToolNames.has('list_audit_events')).toBe(false);
	});

	it('disallowed-tool-use cases never name a reachable production operation', () => {
		for (const entry of goldenPrompts) {
			if (entry.category !== 'disallowed-tool-use') continue;
			expect(entry.operation).toBeNull();
		}
	});

	it('every expected parameter genuinely exists on that operation input shape', () => {
		for (const entry of goldenPrompts) {
			if (entry.operation === null) continue;
			const realParameters = realParameterNamesByOperation[entry.operation];
			expect(realParameters).toBeDefined();
			for (const parameter of entry.expectedParameters) {
				expect(realParameters).toContain(parameter);
			}
		}
	});

	it('every case has a non-empty prompt and a non-empty expected-behavior description', () => {
		for (const entry of goldenPrompts) {
			expect(entry.prompt.length).toBeGreaterThan(0);
			expect(entry.expectedBehavior.length).toBeGreaterThan(0);
		}
	});

	it('every case id is unique', () => {
		const ids = goldenPrompts.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
