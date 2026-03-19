import { watch } from 'node:fs';
import { logger } from '@template/mcp/logger';
import { createTailwindPlugin } from './plugins/tailwind.js';

const tailwindPlugin = createTailwindPlugin();

async function buildStyles() {
	const result = await Bun.build({
		entrypoints: ['src/styles/application.css'],
		outdir: 'public/assets',
		plugins: [tailwindPlugin],
		naming: '[name].[ext]',
	});

	if (!result.success) {
		for (const message of result.logs) {
			logger.error({ err: message }, 'Style build error');
		}
	}
}

await buildStyles();

let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
watch('src', { recursive: true }, (_event, filename) => {
	if (!filename) return;
	if (filename.endsWith('.css') || filename.endsWith('.tsx') || filename.endsWith('.ts')) {
		clearTimeout(rebuildTimer);
		rebuildTimer = setTimeout(buildStyles, 100);
	}
});

const serverProcess = Bun.spawn(['bun', '--watch', 'src/server.ts'], {
	stdout: 'inherit',
	stderr: 'inherit',
	stdin: 'inherit',
});

process.on('SIGINT', () => serverProcess.kill());
process.on('SIGTERM', () => serverProcess.kill());

await serverProcess.exited;

export {};
