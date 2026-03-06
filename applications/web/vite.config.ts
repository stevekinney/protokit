import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

function markdown(): Plugin {
	return {
		name: 'markdown-raw',
		transform(_code, id) {
			if (id.endsWith('.md')) {
				const content = readFileSync(id, 'utf-8');
				return { code: `export default ${JSON.stringify(content)};`, map: null };
			}
		},
	};
}

export default defineConfig(({ mode }) => {
	Object.assign(process.env, loadEnv(mode, '../..', ''));

	return {
		plugins: [markdown(), sveltekit()],
		envDir: '../..',
		server: {
			allowedHosts: true,
		},
		test: {
			include: ['src/**/*.test.ts'],
		},
	};
});
