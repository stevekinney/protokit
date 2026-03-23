import { cpSync, rmSync } from 'node:fs';
import { createTailwindPlugin } from './plugins/tailwind.js';

rmSync('dist', { recursive: true, force: true });

const styleBuildResult = await Bun.build({
	entrypoints: ['src/styles/application.css'],
	outdir: 'public/assets',
	plugins: [createTailwindPlugin({ minify: true })],
	naming: '[name].[ext]',
});

if (!styleBuildResult.success) {
	for (const message of styleBuildResult.logs) {
		console.error(message);
	}
	process.exit(1);
}

const clientBuildResult = await Bun.build({
	entrypoints: ['src/client/entry.tsx'],
	target: 'browser',
	outdir: 'public/assets',
	naming: 'client.[ext]',
	minify: true,
	sourcemap: 'external',
});

if (!clientBuildResult.success) {
	for (const message of clientBuildResult.logs) {
		console.error(message);
	}
	process.exit(1);
}

const serverBuildResult = await Bun.build({
	entrypoints: ['src/server.ts'],
	target: 'bun',
	outdir: 'dist',
	sourcemap: 'external',
	define: { 'process.env.NODE_ENV': '"production"' },
});

if (!serverBuildResult.success) {
	for (const message of serverBuildResult.logs) {
		console.error(message);
	}
	process.exit(1);
}

cpSync('public', 'dist/public', { recursive: true });

export {};
