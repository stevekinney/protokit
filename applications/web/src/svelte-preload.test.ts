import { describe, expect, it } from 'bun:test';
import type { BunPlugin, OnLoadArgs, OnLoadResult, PluginBuilder } from 'bun';
import { registerSveltePlugin } from '@web/svelte-preload';

/**
 * `bunfig.toml` already preloads this module for real at the start of every
 * `bun test` subprocess (the compiler devDependency is installed here, so
 * that real run always takes the happy path). This file exercises the other
 * branch directly -- registered via injected `loadCompiler`/`registerPlugin`
 * so no real `Bun.plugin` registration happens and nothing here depends on
 * the real package being absent.
 */
describe('registerSveltePlugin', () => {
	it('registers the real Svelte plugin when the compiler loads successfully', () => {
		const registered: BunPlugin[] = [];
		const fakeSveltePlugin = () => ({ name: 'fake-svelte-plugin' }) as BunPlugin;

		registerSveltePlugin(
			() => ({ sveltePlugin: fakeSveltePlugin }),
			(bunPlugin) => registered.push(bunPlugin),
		);

		expect(registered).toHaveLength(1);
		expect(registered[0]?.name).toBe('fake-svelte-plugin');
	});

	it('registers a loader that throws a clear message when the compiler devDependency is missing', () => {
		const registered: BunPlugin[] = [];

		registerSveltePlugin(
			() => {
				throw new Error("Cannot find module '@lostgradient/bun-plugin-svelte'");
			},
			(bunPlugin) => registered.push(bunPlugin),
		);

		expect(registered).toHaveLength(1);
		expect(registered[0]?.name).toBe('svelte-compiler-unavailable');

		let capturedOnLoad: ((args: OnLoadArgs) => OnLoadResult | Promise<OnLoadResult>) | undefined;
		const fakeBuild = {
			onLoad: (
				_options: { filter: RegExp },
				callback: (args: OnLoadArgs) => OnLoadResult | Promise<OnLoadResult>,
			) => {
				capturedOnLoad = callback;
			},
		} as unknown as PluginBuilder;

		registered[0]?.setup(fakeBuild);

		expect(capturedOnLoad).toBeDefined();
		expect(() => capturedOnLoad?.({ path: 'home-page.svelte' } as OnLoadArgs)).toThrow(
			/Cannot load home-page\.svelte.*@lostgradient\/bun-plugin-svelte is not installed/,
		);
	});
});
