import { describe, expect, it, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BunPlugin, PluginBuilder, OnLoadArgs, OnLoadResult } from 'bun';
import { createTailwindPlugin } from '@web/plugins/tailwind';

/**
 * `createTailwindPlugin` is the `BunPlugin` `src/build.ts` registers to
 * run every `.css` entrypoint through PostCSS + `@tailwindcss/postcss`
 * during a real `Bun.build`. Rather than going through a full
 * `Bun.build` (whose own CSS bundler renormalizes color values and
 * whitespace on top of whatever this plugin's `onLoad` already returned,
 * making assertions about this plugin's OWN output unreliable), this
 * captures the real `onLoad` callback `setup()` registers and invokes it
 * directly against a real fixture file on disk -- exercising the actual
 * `Bun.file(...).text()` read and the actual `postcss([tailwindcss(...)])
 * .process(...)` call, just without Bun's separate downstream CSS
 * bundling pass obscuring what THIS module's code produced.
 */
async function runOnLoad(
	plugin: BunPlugin,
	args: OnLoadArgs,
): Promise<OnLoadResult | undefined | null> {
	let captured: ((args: OnLoadArgs) => OnLoadResult | Promise<OnLoadResult>) | undefined;
	const fakeBuild = {
		onLoad: (
			_options: { filter: RegExp },
			callback: (args: OnLoadArgs) => OnLoadResult | Promise<OnLoadResult>,
		) => {
			captured = callback;
		},
	} as unknown as PluginBuilder;

	plugin.setup(fakeBuild);
	if (!captured) throw new Error('createTailwindPlugin never registered an onLoad callback');
	return captured(args);
}

describe('createTailwindPlugin', () => {
	let fixtureDirectory: string | undefined;

	afterEach(() => {
		if (fixtureDirectory) {
			rmSync(fixtureDirectory, { recursive: true, force: true });
			fixtureDirectory = undefined;
		}
	});

	function writeFixtureCss(contents: string): string {
		// Written under this application's own directory (transiently --
		// created here and removed in `afterEach`, never committed) rather
		// than the system temp directory: `@tailwindcss/postcss` resolves
		// `@import 'tailwindcss'` via real Node module resolution starting
		// from the CSS file's own directory, which only finds this
		// workspace's `node_modules/tailwindcss` when the fixture lives
		// somewhere under this project tree.
		fixtureDirectory = mkdtempSync(join(import.meta.dir, '.tailwind-plugin-test-fixture-'));
		const entryPath = join(fixtureDirectory, 'entry.css');
		writeFileSync(entryPath, contents);
		return entryPath;
	}

	it('exposes the expected plugin name', () => {
		const plugin = createTailwindPlugin();
		expect(plugin.name).toBe('tailwindcss');
	});

	it('reads the real file at args.path and returns PostCSS-processed CSS with the css loader', async () => {
		const entryPath = writeFixtureCss(
			'.tailwind-plugin-fixture{color:rebeccapurple;padding:1rem;}',
		);

		const plugin = createTailwindPlugin();
		const result = await runOnLoad(plugin, { path: entryPath } as OnLoadArgs);

		expect(result).toBeDefined();
		expect(result?.loader).toBe('css');
		expect(typeof result?.contents).toBe('string');
		expect(result?.contents as string).toContain('.tailwind-plugin-fixture');
		expect(result?.contents as string).toContain('rebeccapurple');
		expect(result?.contents as string).toContain('padding');
	});

	it('defaults minify to false when no options are provided, keeping selector names intact', async () => {
		const entryPath = writeFixtureCss('.tailwind-plugin-fixture { color: red; }');

		const plugin = createTailwindPlugin();
		const result = await runOnLoad(plugin, { path: entryPath } as OnLoadArgs);

		expect(result?.contents as string).toContain('.tailwind-plugin-fixture');
	});

	it('passes the minify:true option through to the Tailwind PostCSS optimizer without erroring', async () => {
		const entryPath = writeFixtureCss('.tailwind-plugin-fixture { color: red; padding: 1rem; }');

		const plugin = createTailwindPlugin({ minify: true });
		const result = await runOnLoad(plugin, { path: entryPath } as OnLoadArgs);

		expect(result?.loader).toBe('css');
		expect(result?.contents as string).toContain('.tailwind-plugin-fixture');
	});

	it('actually invokes the Tailwind PostCSS pipeline: expanding a real @import "tailwindcss" directive rather than passing it through untouched', async () => {
		const entryPath = writeFixtureCss(`@import 'tailwindcss';\n.fixture-marker { color: red; }`);

		const plugin = createTailwindPlugin();
		const result = await runOnLoad(plugin, { path: entryPath } as OnLoadArgs);

		expect(result?.loader).toBe('css');
		const contents = result?.contents as string;
		// A no-op passthrough would leave the literal `@import` statement in
		// the output; the real Tailwind pipeline expands it into the
		// framework's own base/reset layer instead.
		expect(contents).not.toContain("@import 'tailwindcss'");
		expect(contents).toContain('.fixture-marker');
	});

	it('registers onLoad only for .css files', () => {
		let capturedFilter: RegExp | undefined;
		const fakeBuild = {
			onLoad: (options: { filter: RegExp }) => {
				capturedFilter = options.filter;
			},
		} as unknown as PluginBuilder;

		createTailwindPlugin().setup(fakeBuild);

		expect(capturedFilter?.test('styles/application.css')).toBe(true);
		expect(capturedFilter?.test('component.tsx')).toBe(false);
	});
});
