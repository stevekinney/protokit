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
 * blocks. Under `css: 'none'` such a block is discarded outright rather than
 * surfacing anywhere -- the element still gets its scoped class, no stylesheet
 * defines it, and nothing complains. `assertEmptyHead` in `html-response.ts`
 * does NOT catch this: the CSS never reaches `render().head` to begin with.
 * The check that does is in `styles/style-entry.test.ts`.
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
 * The compiler is a devDependency, so it is legitimately absent from a
 * production install (`bun install --production`). Several things run in that
 * state and none of them touch a `.svelte` file: the bundled `dist/server.js`
 * has every component compiled into it already, and root diagnostics like
 * `bun run doctor` never render anything.
 *
 * So a missing compiler is not an error by itself — it is only an error if
 * something actually asks for a component. Rather than guess from `NODE_ENV`
 * (which breaks `bun run doctor`, whose whole job is diagnosing a missing or
 * wrong `NODE_ENV`), register a loader that fails at the point of use with a
 * message that says what to do. A broken dev install therefore still fails
 * loudly, and fails pointing at the real cause rather than surfacing later as
 * the baffling "component is not a function" — a `.svelte` import silently
 * resolving to its own file path.
 *
 * Loaded synchronously via `createRequire`: a preload's top-level `await` does
 * not block the module resolution that follows it, so an async import would
 * register the loader after the first `.svelte` import had already resolved.
 */
const require = createRequire(import.meta.url);

/**
 * Split out of this file's top-level side effect, and parameterized over
 * both the compiler lookup and the plugin registration, specifically so the
 * "compiler devDependency is missing" branch is directly unit-testable
 * (`svelte-preload.test.ts`). That branch is real production behavior --
 * reachable under `bun install --production`, where this devDependency is
 * legitimately absent -- not dead code, but it never runs in this repository's
 * own dev/test environment, where the compiler is always installed. Injecting
 * fake `loadCompiler`/`registerPlugin` implementations exercises the branch
 * for real without needing to actually uninstall the package or re-import
 * this module (which would reset, not union, this file's already-recorded
 * coverage -- the same finding documented for the `SKIP_ENV_VALIDATION`
 * guards in `scripts/assert-coverage-complete.ts`).
 */
export function registerSveltePlugin(
	loadCompiler: () => {
		sveltePlugin: typeof import('@lostgradient/bun-plugin-svelte').sveltePlugin;
	} = () => require('@lostgradient/bun-plugin-svelte'),
	registerPlugin: (bunPlugin: Parameters<typeof plugin>[0]) => void = plugin,
): void {
	let sveltePlugin: typeof import('@lostgradient/bun-plugin-svelte').sveltePlugin | undefined;

	try {
		({ sveltePlugin } = loadCompiler());
	} catch {
		sveltePlugin = undefined;
	}

	if (sveltePlugin) {
		registerPlugin(sveltePlugin({ generate: 'server', css: 'none', dev: isDevelopment }));
	} else {
		registerPlugin({
			name: 'svelte-compiler-unavailable',
			setup(build) {
				build.onLoad({ filter: /\.svelte$/ }, (args) => {
					throw new Error(
						`Cannot load ${args.path}: @lostgradient/bun-plugin-svelte is not installed, ` +
							`so there is no Svelte compiler registered. It is a devDependency, so this is ` +
							`expected under \`bun install --production\` — but nothing in a production ` +
							`install should be importing a component. Run \`bun install\` to get the ` +
							`compiler back.`,
					);
				});
			},
		});
	}
}

registerSveltePlugin();
