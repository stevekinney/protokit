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
		// Prevent client-side Svelte files from importing server-only packages.
		// These barrel exports pull in env vars, database clients, and MCP SDK
		// code that crashes in the browser. Use subpath exports instead.
		files: ['**/*.svelte'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '@template/mcp',
							message:
								'Import from a subpath (e.g., @template/mcp/logger) to avoid pulling server-only code into the client bundle.',
						},
						{
							name: '@template/mcp/logger',
							message:
								'The logger is server-only. Use it in +page.server.ts or +server.ts instead.',
						},
						{
							name: '@template/mcp/env',
							message:
								'Environment variables are server-only. Use them in +page.server.ts or +server.ts instead.',
						},
						{
							name: '@template/database',
							message:
								'The database client is server-only. Use it in +page.server.ts or +server.ts instead.',
						},
					],
				},
			],
		},
	},
	{
		ignores: ['**/node_modules/', '**/.svelte-kit/', '**/build/', '**/dist/', '**/.turbo/'],
	},
);
