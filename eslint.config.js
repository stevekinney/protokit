import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';

/**
 * OPEN-11: registering an OAuth client through the real `POST /oauth/register`
 * endpoint and never deleting it leaked 3,712 `oauth_clients` rows into the
 * shared local test database before anyone noticed. The fix hooks
 * `fetchFromTestServer` (`applications/web/src/test-support/start-test-server.ts`),
 * which every integration suite already routes through, so a registration made
 * that way schedules its own cleanup no matter which path the test took.
 *
 * The one bypass that hook cannot see is a test that calls `fetch(...)` directly
 * against the server's port. This rule closes it: a `fetch` naming
 * `/oauth/register`, as either a plain string or a template literal, is an error
 * outside the helper that owns the cleanup.
 *
 * A lint rule rather than a code change because the bypass is a thing someone
 * writes, not a thing the code does -- there is nothing at runtime to intercept.
 */
const forbidBareRegistrationFetch = {
	files: ['applications/web/src/**/*.test.ts', 'applications/web/src/**/*.test.tsx'],
	ignores: ['applications/web/src/test-support/**'],
	rules: {
		'no-restricted-syntax': [
			'error',
			{
				selector: "CallExpression[callee.name='fetch'] Literal[value=/\\/oauth\\/register/]",
				message:
					'Register OAuth clients through `fetchFromTestServer` (test-support/start-test-server.ts), not a bare fetch. It schedules the cleanup that keeps the shared test database from accumulating client rows (OPEN-11).',
			},
			{
				selector:
					"CallExpression[callee.name='fetch'] TemplateElement[value.raw=/\\/oauth\\/register/]",
				message:
					'Register OAuth clients through `fetchFromTestServer` (test-support/start-test-server.ts), not a bare fetch. It schedules the cleanup that keeps the shared test database from accumulating client rows (OPEN-11).',
			},
		],
	},
};

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
	forbidBareRegistrationFetch,
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
