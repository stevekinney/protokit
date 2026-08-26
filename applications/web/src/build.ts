import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { sveltePlugin } from '@lostgradient/bun-plugin-svelte';
import type { AssetManifest } from '@web/lib/asset-manifest';

// Both browser-side builds compile Svelte identically. `conditions` is
// required for Cinder, which ships its component source behind the `svelte`
// export condition; the plugin cannot add it itself because Bun snapshots the
// build config before plugins run.
const browserBuildOptions = {
	target: 'browser',
	conditions: ['svelte'],
	minify: true,
	// `dev: false` is explicit, not inherited. The plugin's default is
	// `NODE_ENV !== 'production'`, and a dev-compiled bundle expects Svelte's
	// *development* runtime -- which `esm-env` only resolves through the
	// `development` export condition. A production build never wants either,
	// and the mismatch shows up as a hydration failure rather than a build
	// error. Same reasoning as `src/svelte-preload.ts`.
	plugins: [sveltePlugin({ generate: 'client', css: 'none', dev: false })],
} as const;

// Every generated asset is built into this scratch directory first, never
// straight into `public/assets`. That lets the build validate exactly what
// came out before anything is published, so a previous build's stale hashed
// files can never survive alongside a new one and an unexpected extra output
// can never slip into the served directory unnoticed.
const stagingDirectory = 'dist/assets-staging';
const publishedAssetsDirectory = 'public/assets';

rmSync('dist', { recursive: true, force: true });
mkdirSync(stagingDirectory, { recursive: true });

// The stylesheet is produced by bundling a JavaScript graph, not a CSS file.
// `style-entry.ts` imports every page component, so Bun walks into each Cinder
// component those pages render and picks up the CSS shipped beside it -- which
// is how the pages that serve no JavaScript still get exactly the component
// styles they need, and no more. The JavaScript this build emits is a
// byproduct and is deliberately discarded below.
const styleBuildResult = await Bun.build({
	...browserBuildOptions,
	entrypoints: ['src/styles/style-entry.ts'],
	outdir: stagingDirectory,
	naming: 'application-[hash].[ext]',
});

if (!styleBuildResult.success) {
	for (const message of styleBuildResult.logs) {
		console.error(message);
	}
	process.exit(1);
}

const clientBuildResult = await Bun.build({
	...browserBuildOptions,
	entrypoints: ['src/client/entry.ts'],
	outdir: stagingDirectory,
	naming: 'client-[hash].[ext]',
	sourcemap: 'external',
});

if (!clientBuildResult.success) {
	for (const message of clientBuildResult.logs) {
		console.error(message);
	}
	process.exit(1);
}

const styleOutputs = styleBuildResult.outputs;
const clientOutputs = clientBuildResult.outputs;

const stylesheetFilename = basename(styleOutputs.find((o) => o.path.endsWith('.css'))!.path);
const clientBundleFilename = basename(
	clientOutputs.find((o) => o.path.endsWith('.js') && !o.path.endsWith('.js.map'))!.path,
);
const clientSourceMapFilename = basename(
	clientOutputs.find((o) => o.path.endsWith('.js.map'))!.path,
);

// Two outputs are expected and intentionally thrown away:
//
//   - the style build's JavaScript, which only ever existed to give the
//     bundler a graph to walk for CSS;
//   - the client build's CSS, which is a strict subset of the stylesheet
//     above (the hydrated pages are a subset of all pages), so publishing it
//     would ship the same rules twice.
//
// They are named here rather than ignored so the undeclared-output check
// below stays exhaustive: a genuinely unexpected artifact still fails.
const discardedOutputFilenames = new Set(
	[
		...styleOutputs.filter((o) => !o.path.endsWith('.css')),
		...clientOutputs.filter((o) => o.path.endsWith('.css')),
	].map((output) => basename(output.path)),
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
	...discardedOutputFilenames,
]);
const producedOutputFilenames = [...styleOutputs, ...clientOutputs].map((output) =>
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
	// `generate: 'server'` and `css: 'none'` must match `src/svelte-preload.ts`
	// exactly, so the bundled server renders identically to the one that runs
	// under `bun run src/server.ts` in development and under `bun test`.
	plugins: [sveltePlugin({ generate: 'server', css: 'none', dev: false })],
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

// Bun's bundler constant-folds a static `process.env.NODE_ENV` (or
// `process.env["NODE_ENV"]`) member access at build time. That made the
// shipped server read whichever value happened to be set on the *build*
// machine — "production" inside the Docker builder stage, "development" for a
// local build — so CONFIG-001's fail-closed startup invariants could never
// observe the real runtime value, and the image could not be booted in any
// other mode. `env.ts` never names `NODE_ENV` as a static property access at
// all: it resolves the whole environment through `@lostgradient/environmentalist`,
// which reads variables by enumerating `Object.entries(process.env)` — a
// dynamic read of the object Bun's bundler has no static property name to
// fold.
//
// That is a subtle property to preserve by convention alone, so assert it
// here: a future edit that reads `environment.nodeEnv` from a schema wired up
// through a literal `process.env.NODE_ENV`/`process.env["NODE_ENV"]` access
// instead of the resolver's dynamic enumeration fails the build rather than
// quietly shipping an artifact whose environment is frozen at build time.
const serverBundleSource = await Bun.file('dist/server.js').text();
if (!serverBundleSource.includes('Object.entries(process.env)')) {
	console.error(
		'Build aborted: dist/server.js contains no runtime enumeration of process.env, which\n' +
			'means NODE_ENV (and every other setting) may have been inlined at build time.\n' +
			"Resolve the environment through env.ts's `environmentalist.sync(...)` call so the\n" +
			'value stays configurable at runtime.',
	);
	process.exit(1);
}

cpSync('public', 'dist/public', { recursive: true });
rmSync(stagingDirectory, { recursive: true, force: true });

export {};
