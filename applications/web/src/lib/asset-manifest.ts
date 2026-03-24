import { resolvePublicFile } from '@web/resolve-public-file';

export type AssetManifest = {
	stylesheetPath: string;
	clientBundlePath: string;
	clientSourceMapPath: string;
};

const defaultManifest: AssetManifest = {
	stylesheetPath: '/assets/application.css',
	clientBundlePath: '/assets/client.js',
	clientSourceMapPath: '/assets/client.js.map',
};

let cachedManifest: AssetManifest | null = null;

export async function loadAssetManifest(): Promise<AssetManifest> {
	const file = await resolvePublicFile('assets/manifest.json');

	if (!file) {
		if (process.env.NODE_ENV === 'production') {
			throw new Error(
				'Asset manifest not found. Run the build before starting the production server.',
			);
		}
		cachedManifest = defaultManifest;
		return cachedManifest;
	}

	const contents = await file.text();
	cachedManifest = JSON.parse(contents) as AssetManifest;
	return cachedManifest;
}

export function getAssetManifest(): AssetManifest {
	if (!cachedManifest) {
		return defaultManifest;
	}
	return cachedManifest;
}
