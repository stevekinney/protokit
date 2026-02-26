import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs.recommended,
	{
		files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: tseslint.parser },
		},
	},
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
	{
		ignores: ['**/node_modules/', '**/.svelte-kit/', '**/build/', '**/dist/', '**/.turbo/'],
	},
);
