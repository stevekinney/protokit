import { describe, expect, it, mock } from 'bun:test';

/**
 * Isolates `loadAssetManifest`'s "manifest missing AND NODE_ENV=production"
 * branch: fails closed with a thrown error rather than silently serving
 * the hardcoded default (stale/wrong asset hashes) in what is supposed to
 * be a real production deployment. Mocks `@web/resolve-public-file` the
 * same way `asset-manifest-not-found-development.test.ts` does, and lives
 * in its own file for the same reason: the mock and the `NODE_ENV`
 * override are both process-global, and the suite runs with `--isolate`
 * so each file is its own process.
 */
mock.module('@web/resolve-public-file', () => ({
	resolvePublicFile: async () => null,
}));

process.env['NODE_ENV'] = 'production';

const { loadAssetManifest } = await import('@web/lib/asset-manifest');

describe('loadAssetManifest when the manifest file is missing in production', () => {
	it('throws instead of silently falling back to the default manifest', async () => {
		await expect(loadAssetManifest()).rejects.toThrow(
			'Asset manifest not found. Run the build before starting the production server.',
		);
	});
});
