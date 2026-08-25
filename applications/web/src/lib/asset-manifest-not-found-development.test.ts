import { describe, expect, it, mock } from 'bun:test';

/**
 * Isolates `loadAssetManifest`'s "manifest missing, not production" branch:
 * falls back to the hardcoded default manifest rather than throwing. Mocks
 * `@web/resolve-public-file` (the codebase's existing convention for
 * isolating a dependency without touching the real filesystem — see
 * `resolve-public-file-realpath-failure.test.ts`) so this doesn't depend on
 * the real `public/assets/manifest.json` being absent, which it normally
 * is not once the build has run. Lives in its own file because the mock is
 * module-global; the suite runs with `--isolate`, so each file is its own
 * process and this can't leak into `asset-manifest.test.ts`'s real-build
 * assertions.
 */
mock.module('@web/resolve-public-file', () => ({
	resolvePublicFile: async () => null,
}));

const { loadAssetManifest, getAssetManifest } = await import('@web/lib/asset-manifest');

describe('loadAssetManifest when the manifest file is missing (non-production)', () => {
	it('falls back to the hardcoded default manifest instead of throwing', async () => {
		const manifest = await loadAssetManifest();
		expect(manifest).toEqual({
			stylesheetPath: '/assets/application.css',
			clientBundlePath: '/assets/client.js',
			clientSourceMapPath: '/assets/client.js.map',
		});
	});

	it('caches the fallback default so getAssetManifest reflects it afterward', async () => {
		await loadAssetManifest();
		expect(getAssetManifest()).toEqual({
			stylesheetPath: '/assets/application.css',
			clientBundlePath: '/assets/client.js',
			clientSourceMapPath: '/assets/client.js.map',
		});
	});
});
