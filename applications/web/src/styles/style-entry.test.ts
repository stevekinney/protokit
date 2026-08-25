import { describe, expect, it } from 'bun:test';

/**
 * The stylesheet is built by bundling `style-entry.ts` and keeping the CSS
 * that graph pulls in. A page component missing from that graph therefore
 * renders without its Cinder component styles -- and because the OAuth and
 * legal pages ship no JavaScript at all, nothing else would ever pull them
 * in. That failure is invisible in every unit test and shows up only as an
 * unstyled page in a browser.
 *
 * So the guard is here instead: every component under `src/views` and
 * `src/components` must be imported by `style-entry.ts`.
 */
describe('style-entry.ts', () => {
	it('imports every page component, so the stylesheet covers every page', async () => {
		const entrySource = await Bun.file(new URL('./style-entry.ts', import.meta.url)).text();

		const componentPaths = [
			...new Bun.Glob('*.svelte').scanSync({ cwd: new URL('../views', import.meta.url).pathname }),
		]
			.map((name) => `@web/views/${name}`)
			.concat(
				[
					...new Bun.Glob('*.svelte').scanSync({
						cwd: new URL('../components', import.meta.url).pathname,
					}),
				].map((name) => `@web/components/${name}`),
			);

		expect(componentPaths.length).toBeGreaterThan(0);

		const missing = componentPaths.filter(
			(specifier) => !entrySource.includes(`import '${specifier}';`),
		);

		expect(missing).toEqual([]);
	});
});
