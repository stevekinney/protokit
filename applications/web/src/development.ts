import { rmSync } from 'node:fs';
import { watch } from 'node:fs';
import { logger } from '@template/mcp/logger';
import { sveltePlugin } from '@lostgradient/bun-plugin-svelte';
import type { AssetManifest } from '@web/lib/asset-manifest';

// `dev` and the `development` condition have to move together. A dev-compiled
// component expects Svelte's development runtime, which `esm-env` selects
// through the `development` export condition -- so compiling for dev without
// requesting that condition yields a dev bundle against a production runtime,
// which fails at hydration rather than at build time. `conditions: ['svelte']`
// is separately required by Cinder, which ships its source behind it.
const browserBuildOptions = {
	target: 'browser',
	conditions: ['svelte', 'development'],
	plugins: [sveltePlugin({ generate: 'client', css: 'none', dev: true })],
} as const;

const stableManifest: AssetManifest = {
	stylesheetPath: '/assets/application.css',
	clientBundlePath: '/assets/client.js',
	clientSourceMapPath: '/assets/client.js.map',
};

async function writeStableManifest() {
	await Bun.write('public/assets/manifest.json', JSON.stringify(stableManifest, null, '\t'));
}

// Bundles `style-entry.ts` purely to collect the CSS its graph pulls in --
// the JavaScript output is written alongside and simply never referenced.
// See `src/styles/style-entry.ts` for why the stylesheet is built this way.
async function buildStyles() {
	const result = await Bun.build({
		...browserBuildOptions,
		entrypoints: ['src/styles/style-entry.ts'],
		outdir: 'public/assets',
		naming: 'application.[ext]',
	});

	if (!result.success) {
		for (const message of result.logs) {
			logger.error({ err: message }, 'Style build error');
		}
		return;
	}

	// `style-entry.ts` is bundled for its CSS; the JavaScript is a byproduct
	// nothing links to. The production build stages and discards it -- here it
	// is written in place, so remove it rather than leave an unreferenced
	// bundle sitting in the served directory looking meaningful.
	rmSync('public/assets/application.js', { force: true });
}

async function buildClientBundle() {
	const result = await Bun.build({
		...browserBuildOptions,
		entrypoints: ['src/client/entry.ts'],
		outdir: 'public/assets',
		naming: 'client.[ext]',
		sourcemap: 'external',
	});

	if (!result.success) {
		for (const message of result.logs) {
			logger.error({ err: message }, 'Client bundle build error');
		}
		return;
	}

	// The client bundle's CSS is a strict subset of the stylesheet built above
	// (hydrated pages are a subset of all pages), so it is a duplicate. Same
	// reasoning as the discarded outputs in `src/build.ts`.
	rmSync('public/assets/client.css', { force: true });
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
