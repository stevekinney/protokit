import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `loadAssetManifest`/`getAssetManifest` exercised against the REAL
 * `public/assets/manifest.json` this repository's own build produces (see
 * `src/build.ts` and `resolve-public-file.test.ts`'s precedent of testing
 * against the real `public/` directory rather than mocking the
 * filesystem). The not-found and production-throws-when-missing branches
 * live in their own isolated files below, each mocking
 * `@web/resolve-public-file` so the mock cannot leak into this file's
 * real-filesystem assertions (the suite runs with `--isolate`, so each
 * file is its own process).
 *
 * `cachedManifest` is module-level state, so test order within this file
 * matters: the "before any load" assertion must run first.
 */
describe('getAssetManifest before any load', () => {
	it('returns the hardcoded default manifest when nothing has been loaded yet', async () => {
		const { getAssetManifest } = await import('@web/lib/asset-manifest');
		expect(getAssetManifest()).toEqual({
			stylesheetPath: '/assets/application.css',
			clientBundlePath: '/assets/client.js',
			clientSourceMapPath: '/assets/client.js.map',
		});
	});
});

describe('loadAssetManifest / getAssetManifest against the real build output', () => {
	it('reads and parses the real public/assets/manifest.json', async () => {
		const { loadAssetManifest } = await import('@web/lib/asset-manifest');
		const manifestPath = fileURLToPath(
			new URL('../../public/assets/manifest.json', import.meta.url),
		);
		const expected = JSON.parse(readFileSync(manifestPath, 'utf-8'));

		const manifest = await loadAssetManifest();

		expect(manifest).toEqual(expected);
		expect(manifest.stylesheetPath).toMatch(/^\/assets\/.+\.css$/);
		expect(manifest.clientBundlePath).toMatch(/^\/assets\/.+\.js$/);
		expect(manifest.clientSourceMapPath).toMatch(/^\/assets\/.+\.js\.map$/);
	});

	it('caches the loaded manifest so getAssetManifest reflects it afterward', async () => {
		const { loadAssetManifest, getAssetManifest } = await import('@web/lib/asset-manifest');
		const loaded = await loadAssetManifest();
		expect(getAssetManifest()).toEqual(loaded);
	});
});
