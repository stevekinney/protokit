/**
 * Registers the Svelte compiler with the Bun *runtime* loader so that
 * `import Page from './page.svelte'` works directly under `bun run` and
 * `bun test`, with no build step in between.
 *
 * `generate: 'server'` because every runtime `.svelte` import in this
 * application is a server render. The browser bundle is compiled separately
 * by `src/build.ts` with `generate: 'client'`.
 *
 * `css: 'none'` is forced by the architecture, not a preference:
 *   - `'injected'` would deliver styles through `render().head`, which
 *     shell-first streaming flushes before the body renders, and would emit
 *     an inline `<style>` that `style-src 'self'` forbids.
 *   - `'external'` never emits anything on server compiles, which is exactly
 *     where the zero-JavaScript pages need their styles.
 * Component CSS therefore comes from the stylesheet that
 * `src/styles/style-entry.ts` collects. See `src/build.ts`.
 *
 * Consequence: `.svelte` files in this application must not use `<style>`
 * blocks. `renderDocument` asserts `render().head` is empty, which catches
 * both a stray `<svelte:head>` and any accidental style injection.
 */
import { createRequire } from 'node:module';
import { plugin } from 'bun';

/**
 * `dev` tracks `NODE_ENV === 'development'` exactly, and must not be widened
 * to the plugin's own default of `NODE_ENV !== 'production'`.
 *
 * A dev-compiled component emits `push_element()` calls that read
 * `ssr_context.function`. That field is only populated when the Svelte
 * *runtime* is its development build, which is selected by the `development`
 * export condition via `esm-env`. Bun applies that condition only when
 * `NODE_ENV === 'development'` -- there is no `bunfig.toml` key for it.
 *
 * So under `NODE_ENV=test` the plugin's default would compile components for
 * dev while resolving the production runtime, and every server render would
 * die with `undefined is not an object (evaluating 'context.function[FILENAME]')`.
 * Pinning `dev` to the one value of NODE_ENV that Bun treats as development
 * keeps compiler and runtime in agreement in every mode.
 *
 * Read via the bracket form so the bundler cannot constant-fold it; see the
 * NODE_ENV assertion in `src/build.ts`.
 */
const isDevelopment = process.env['NODE_ENV'] === 'development';

/**
 * The plugin is a devDependency, so a production install (`bun install
 * --production`) does not have it. That is fine and expected: the only thing
 * run in production is the bundled `dist/server.js`, which already has every
 * component compiled into it and never asks the runtime to load a `.svelte`
 * file. Registering nothing there is correct.
 *
 * Outside production a missing plugin is a broken install, and swallowing it
 * would surface much later as the genuinely baffling "component is not a
 * function" — the `.svelte` import silently resolving to its own file path.
 * So the failure is only tolerated for the one case where it means something.
 */
// Loaded synchronously. A preload's top-level `await` does not block the
// module resolution that follows it, so an async import here would register
// the loader *after* the first `.svelte` import had already been resolved.
const require = createRequire(import.meta.url);

let sveltePlugin: typeof import('@lostgradient/bun-plugin-svelte').sveltePlugin | undefined;

try {
	({ sveltePlugin } = require('@lostgradient/bun-plugin-svelte'));
} catch (error) {
	if (process.env['NODE_ENV'] !== 'production') throw error;
}

if (sveltePlugin) {
	plugin(sveltePlugin({ generate: 'server', css: 'none', dev: isDevelopment }));
}
