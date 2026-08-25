/**
 * The stylesheet's entry point -- and the reason this application needs no
 * per-component CSS imports scattered through its pages.
 *
 * Cinder ships each component's CSS beside it, and each component entry point
 * imports its own stylesheet. A bundler walking a JavaScript graph therefore
 * collects exactly the component CSS that graph references. Neither of the
 * application's own bundles can do that collection on its own, though:
 *
 *   - The server resolves Cinder through the `node` export condition, which
 *     points at a deliberately CSS-free build.
 *   - The client bundle only contains the pages that hydrate, so the OAuth
 *     consent screen and the legal pages -- which ship no JavaScript at all --
 *     would contribute nothing.
 *
 * So this module exists purely to be a graph containing every page. `build.ts`
 * bundles it for the browser, keeps the CSS it emits, and throws the
 * JavaScript away.
 *
 * ADDING A PAGE: import it below. `style-entry.test.ts` fails the build if a
 * component under `src/views` or `src/components` is missing, so a forgotten
 * import surfaces as a test failure rather than an unstyled page.
 */

// Must come first: this declares Cinder's `@layer` order and provides the
// tokens, foundation, and utilities every component builds on.
import '@lostgradient/cinder/styles';

import './application.css';

import '@web/components/home-page.svelte';
import '@web/views/legal-page-shell.svelte';
import '@web/views/oauth-authorize-page.svelte';
import '@web/views/privacy-policy-page.svelte';
import '@web/views/support-contact-notice.svelte';
import '@web/views/support-page.svelte';
import '@web/views/terms-of-service-page.svelte';
