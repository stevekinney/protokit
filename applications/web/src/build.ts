import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AssetManifest } from '@web/lib/asset-manifest';
import { createTailwindPlugin } from './plugins/tailwind.js';

// Every generated asset is built into this scratch directory first, never
// straight into `public/assets`. That lets the build validate exactly what
// came out before anything is published, so a previous build's stale hashed
// files can never survive alongside a new one and an unexpected extra output
// can never slip into the served directory unnoticed.
const stagingDirectory = 'dist/assets-staging';
const publishedAssetsDirectory = 'public/assets';

rmSync('dist', { recursive: true, force: true });
mkdirSync(stagingDirectory, { recursive: true });

const styleBuildResult = await Bun.build({
	entrypoints: ['src/styles/application.css'],
	outdir: stagingDirectory,
	plugins: [createTailwindPlugin({ minify: true })],
	naming: '[name]-[hash].[ext]',
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
	outdir: stagingDirectory,
	naming: 'client-[hash].[ext]',
	minify: true,
	sourcemap: 'external',
});

if (!clientBuildResult.success) {
	for (const message of clientBuildResult.logs) {
		console.error(message);
	}
	process.exit(1);
}

const stylesheetFilename = basename(styleBuildResult.outputs[0].path);
const clientOutputs = clientBuildResult.outputs;
const clientBundleFilename = basename(clientOutputs.find((o) => o.path.endsWith('.js'))!.path);
const clientSourceMapFilename = basename(
	clientOutputs.find((o) => o.path.endsWith('.js.map'))!.path,
);

// Fail the build if either bundler produced anything beyond the three files
// this build script knows how to name, validate, and publish. A silent
// extra output (an unexpected chunk, an image asset copied through, a second
// source map) is exactly the kind of undeclared artifact that erodes
// reproducibility.
const declaredOutputFilenames = new Set([
	stylesheetFilename,
	clientBundleFilename,
	clientSourceMapFilename,
]);
const producedOutputFilenames = [...styleBuildResult.outputs, ...clientOutputs].map((output) =>
	basename(output.path),
);
const undeclaredOutputFilenames = producedOutputFilenames.filter(
	(filename) => !declaredOutputFilenames.has(filename),
);
if (undeclaredOutputFilenames.length > 0) {
	console.error(`Build produced undeclared asset output: ${undeclaredOutputFilenames.join(', ')}`);
	process.exit(1);
}

// Publish only the declared, non-source-map files. Clearing the published
// directory first (rather than overwriting into it) guarantees no
// previously built hashed asset is ever left behind for a request to find.
rmSync(publishedAssetsDirectory, { recursive: true, force: true });
mkdirSync(publishedAssetsDirectory, { recursive: true });
cpSync(
	join(stagingDirectory, stylesheetFilename),
	join(publishedAssetsDirectory, stylesheetFilename),
);
cpSync(
	join(stagingDirectory, clientBundleFilename),
	join(publishedAssetsDirectory, clientBundleFilename),
);
// The client source map stays in the staging directory only. It is never
// copied into `public/assets`, so it is never published to the production
// image or served over HTTP by default.

const manifest: AssetManifest = {
	stylesheetPath: `/assets/${stylesheetFilename}`,
	clientBundlePath: `/assets/${clientBundleFilename}`,
	clientSourceMapPath: `/assets/${clientSourceMapFilename}`,
};

await Bun.write(
	join(publishedAssetsDirectory, 'manifest.json'),
	JSON.stringify(manifest, null, '\t'),
);

const serverBuildResult = await Bun.build({
	entrypoints: ['src/server.ts'],
	target: 'bun',
	outdir: 'dist',
	sourcemap: 'external',
	// Deliberately no `define` for `process.env.NODE_ENV`. Baking it in as a
	// compile-time literal makes the built server read "production" no matter
	// what the runtime environment says, which defeats CONFIG-001's fail-closed
	// startup invariants inside the artifact — they can never observe a wrong or
	// missing NODE_ENV — and makes the image impossible to boot in any other mode,
	// which is what broke `bun run test:container-smoke`. The Dockerfile sets
	// `ENV NODE_ENV=production`, so production still gets the right value from the
	// environment, and a host that forgets it now fails closed as intended.
});

if (!serverBuildResult.success) {
	for (const message of serverBuildResult.logs) {
		console.error(message);
	}
	process.exit(1);
}

// Bun's bundler constant-folds `process.env.NODE_ENV` at build time. That made
// the shipped server read whichever value happened to be set on the *build*
// machine — "production" inside the Docker builder stage, "development" for a
// local build — so CONFIG-001's fail-closed startup invariants could never
// observe the real runtime value, and the image could not be booted in any other
// mode. `env.ts` reads `process.env['NODE_ENV']` instead, which Bun leaves alone.
//
// That is a subtle property to preserve by convention alone, so assert it here:
// a future edit that reverts to the dot form fails the build rather than quietly
// shipping an artifact whose environment is frozen at build time.
const serverBundleSource = await Bun.file('dist/server.js').text();
if (!serverBundleSource.includes(`process.env["NODE_ENV"]`)) {
	console.error(
		'Build aborted: dist/server.js contains no runtime read of NODE_ENV, which means the\n' +
			'bundler inlined it at build time. Read it as `process.env["NODE_ENV"]` (bracket\n' +
			'literal) rather than `process.env.NODE_ENV` so the value stays configurable at runtime.',
	);
	process.exit(1);
}

cpSync('public', 'dist/public', { recursive: true });
rmSync(stagingDirectory, { recursive: true, force: true });

export {};
