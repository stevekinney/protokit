import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node, ...globals.bun },
		},
	},
	{
		files: ['applications/web/src/views/**/*.tsx'],
	},
	{
		ignores: ['**/node_modules/', '**/build/', '**/dist/', '**/.turbo/'],
	},
);
