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

	/**
	 * Components in this application must not use `<style>` blocks, and this is
	 * the check that enforces it — `assertEmptyHead` in `html-response.ts` does
	 * not and cannot.
	 *
	 * The compiler runs with `css: 'none'` on every side (see
	 * `svelte-preload.ts` for why: the zero-JavaScript pages have no way to load
	 * component-emitted CSS). Under that mode a `<style>` block is discarded
	 * outright — it never reaches `render().head`, so the head stays empty and
	 * every existing assertion passes. What ships is an element carrying a
	 * scoped class, `class="probe svelte-19c2009"`, that no stylesheet anywhere
	 * defines. Verified directly; the failure is completely silent.
	 *
	 * Style with Cinder components, Cinder tokens, and the classes in
	 * `application.css` instead.
	 */
	it('has no component that uses a <style> block, which would be silently discarded', async () => {
		const roots = ['../views', '../components', '../test-fixtures'];
		const offenders: string[] = [];

		for (const root of roots) {
			const directory = new URL(`${root}/`, import.meta.url);
			for (const name of new Bun.Glob('**/*.svelte').scanSync({ cwd: directory.pathname })) {
				const source = await Bun.file(new URL(name, directory)).text();
				if (/^\s*<style[\s>]/m.test(source)) offenders.push(`${root.slice(3)}/${name}`);
			}
		}

		expect(offenders).toEqual([]);
	});
});
