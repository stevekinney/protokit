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
import { plugin } from 'bun';
import { sveltePlugin } from '@lostgradient/bun-plugin-svelte';

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

plugin(sveltePlugin({ generate: 'server', css: 'none', dev: isDevelopment }));
