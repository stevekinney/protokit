import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node, ...globals.bun },
		},
	},
	{
		// Svelte components carry TypeScript in `<script lang="ts">`, so the
		// Svelte parser has to hand those blocks to the TypeScript parser.
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: { parser: tseslint.parser },
		},
	},
	{
		ignores: [
			'**/node_modules/',
			'**/build/',
			'**/dist/',
			'**/.turbo/',
			'**/public/assets/**',
			'**/.svelte-kit/',
		],
	},
);
