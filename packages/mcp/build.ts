#!/usr/bin/env bun
/**
 * Build the publishable artifact.
 *
 * Two steps, because neither tool does both jobs:
 *
 * - **`Bun.build` emits the JavaScript.** A bundler rather than `tsc` because
 *   `server.ts` imports `instructions.md` with `{ type: 'text' }`, which is a
 *   Bun loader extension: Node supports only `type: 'json'` and throws
 *   `ERR_UNKNOWN_FILE_EXTENSION` on anything else. `tsc` would preserve that
 *   import verbatim and would not copy the `.md` either, so its output cannot
 *   be imported by a Node consumer at all. Bundling inlines the text and the
 *   problem disappears from the published artifact without the source having
 *   to work around it.
 * - **`tsc --emitDeclarationOnly` emits the types**, which a bundler does not
 *   produce.
 *
 * `packages: 'external'` is what keeps this a library rather than a vendored
 * copy of its dependencies: `@modelcontextprotocol/*`, `pino`, and `zod` stay
 * as imports for the consumer's own resolver to satisfy.
 */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const packageRoot = import.meta.dir;
const outdir = join(packageRoot, 'dist');

/**
 * Every subpath in the package's `exports` map needs its own entry point.
 *
 * `src/testing/` is deliberately absent. It is excluded from `typecheck` (see
 * `tsconfig.json`), and that exclusion was hiding two things that make it
 * unpublishable: `createTestContext` returns an object missing `signal`, which
 * `McpContext` requires, and `tool-assertions.ts` imports `bun:test` — a
 * Bun-only module a Node or vitest consumer cannot load at all. Test helpers
 * coupled to the publisher's own test runner are not a consumable API, so the
 * directory stays internal rather than shipping broken.
 */
const ENTRY_POINTS = [
	'src/index.ts',
	'src/logger.ts',
	'src/env.ts',
	'src/metrics.ts',
	'src/environment-schema.ts',
	'src/version.ts',
	'src/oauth/index.ts',
	'src/oauth/stores.ts',
	'src/oauth/testing/index.ts',
].map((entry) => join(packageRoot, entry));

await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
	entrypoints: ENTRY_POINTS,
	outdir,
	root: join(packageRoot, 'src'),
	target: 'node',
	format: 'esm',
	packages: 'external',
	// Shared modules become shared chunks rather than being duplicated into
	// every entry point. Without this, each subpath bundles its own copy of
	// `logger.ts`, `metrics.ts`, and `env.ts`, so `logger` imported from
	// `@lostgradient/mcp` is a DIFFERENT object from the one imported via
	// `@lostgradient/mcp/logger` — configuration applied to one is invisible to
	// the other, and the memoized environment is parsed more than once.
	// Verified: with splitting off, `a.logger === b.logger` is false across the
	// two subpaths.
	splitting: true,
	sourcemap: 'none',
});

if (!result.success) {
	console.error('Bundling failed:');
	for (const message of result.logs) console.error(`  ${message}`);
	process.exit(1);
}

const types = Bun.spawnSync(['bunx', 'tsc', '-p', join(packageRoot, 'tsconfig.build.json')], {
	cwd: packageRoot,
	stdout: 'inherit',
	stderr: 'inherit',
});

if (types.exitCode !== 0) {
	console.error(`Declaration emit failed (exit ${types.exitCode}).`);
	process.exit(types.exitCode ?? 1);
}

console.log(`Built ${result.outputs.length} module(s) and their declarations into dist/.`);
