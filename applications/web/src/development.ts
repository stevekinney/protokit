import { watch } from 'node:fs';
import { logger } from '@template/mcp/logger';
import type { AssetManifest } from '@web/lib/asset-manifest';
import { createTailwindPlugin } from './plugins/tailwind.js';

const tailwindPlugin = createTailwindPlugin();

const stableManifest: AssetManifest = {
	stylesheetPath: '/assets/application.css',
	clientBundlePath: '/assets/client.js',
	clientSourceMapPath: '/assets/client.js.map',
};

async function writeStableManifest() {
	await Bun.write('public/assets/manifest.json', JSON.stringify(stableManifest, null, '\t'));
}

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

async function buildClientBundle() {
	const result = await Bun.build({
		entrypoints: ['src/client/entry.tsx'],
		target: 'browser',
		outdir: 'public/assets',
		naming: 'client.[ext]',
		sourcemap: 'external',
	});

	if (!result.success) {
		for (const message of result.logs) {
			logger.error({ err: message }, 'Client bundle build error');
		}
	}
}

await buildStyles();
await buildClientBundle();
await writeStableManifest();

let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
let building = false;
let rebuildQueued = false;

async function scheduledBuild() {
	if (building) {
		rebuildQueued = true;
		return;
	}
	building = true;
	try {
		await buildStyles();
		await buildClientBundle();
		await writeStableManifest();
	} finally {
		building = false;
		if (rebuildQueued) {
			rebuildQueued = false;
			await scheduledBuild();
		}
	}
}

const watcher = watch('src', { recursive: true }, (_event, filename) => {
	if (!filename) return;
	if (filename.endsWith('.css') || filename.endsWith('.tsx') || filename.endsWith('.ts')) {
		clearTimeout(rebuildTimer);
		rebuildTimer = setTimeout(scheduledBuild, 100);
	}
});

const serverProcess = Bun.spawn(['bun', '--watch', 'src/server.ts'], {
	stdout: 'inherit',
	stderr: 'inherit',
	stdin: 'inherit',
});

function shutdown() {
	clearTimeout(rebuildTimer);
	watcher.close();
	serverProcess.kill();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const exitCode = await serverProcess.exited;

shutdown();

if (exitCode !== 0) {
	logger.error({ exitCode }, 'Development server exited with non-zero code');
	process.exit(exitCode ?? 1);
}

export {};
