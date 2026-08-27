import { z } from 'zod';
import { defineScopes } from './scope-vocabulary.js';
import type { McpRegistry } from './scope-vocabulary.js';

/**
 * Compile-time assertions for the consumer-vocabulary contract.
 *
 * These live in a non-test file deliberately: `tsconfig.json` excludes
 * `src/**\/*.test.ts` from `typecheck`, so a type-level guarantee asserted
 * only in a test file is never actually checked by the command that claims to
 * check types. This file is compiled by `bun run typecheck`.
 *
 * Every `@ts-expect-error` below is also its own fails-when-removed proof: if
 * the constraint it documents is loosened, the error it expects stops
 * occurring, the directive becomes unused, and `tsc` fails on the directive
 * itself. There is no way to relax the vocabulary binding and leave this file
 * passing.
 */

const consumerVocabulary = defineScopes({
	'repositories:read': 'Read repository metadata.',
	'conformance:read': 'Conformance fixtures only.',
});

const noopHandler = async () => ({ content: [] });

// A scope drawn from the vocabulary is accepted.
consumerVocabulary.defineTool({
	name: 'in_vocabulary',
	title: 'In vocabulary',
	description: 'Declares a scope this vocabulary contains.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	requiredScope: 'repositories:read',
	handler: noopHandler,
});

consumerVocabulary.defineTool({
	name: 'typo_scope',
	title: 'Typo scope',
	description: 'A mistyped scope must fail here, on the tool, not later at registry assignment.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	// @ts-expect-error - 'reposotories:read' is not in this vocabulary. An
	// unbound `defineTool` would infer `Scope` from this literal and accept
	// it; the bound definer is what puts the failure on the primitive's own
	// line.
	requiredScope: 'reposotories:read',
	handler: noopHandler,
});

consumerVocabulary.defineTool({
	name: 'wildcard_scope',
	title: 'Wildcard scope',
	description: 'An all-access scope must not be expressible.',
	inputSchema: z.object({}),
	annotations: {
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
	// @ts-expect-error - there is no wildcard member, so '*' is rejected the
	// same way any other non-member is. AUTHZ-001's "no generic all-access
	// scope" survives opening the vocabulary because membership is exact on
	// both sides.
	requiredScope: '*',
	handler: noopHandler,
});

// A scope from another vocabulary is not silently interchangeable.
const otherVocabulary = defineScopes({ 'unrelated:read': 'Something else entirely.' });

const crossVocabularyRegistry: McpRegistry<'repositories:read' | 'conformance:read'> = {
	tools: [],
	resources: [],
	prompts: [
		// @ts-expect-error - a prompt typed against a different vocabulary
		// cannot be registered here. Two consumers' vocabularies are distinct
		// types, not two aliases for `string`.
		otherVocabulary.definePrompt({
			name: 'foreign',
			title: 'Foreign',
			description: 'Declared against a different vocabulary.',
			arguments: undefined,
			requiredScope: 'unrelated:read',
			handler: async () => ({ messages: [] }),
		}),
	],
};

void crossVocabularyRegistry;
