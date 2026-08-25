export function getContentSecurityPolicy(options: { allowScripts: boolean }): string {
	const scriptSrc = options.allowScripts ? "'self'" : "'none'";
	// SEC-005 / S-17: `style-src` has no `'unsafe-inline'`. Every stylesheet
	// this server serves is the single bundle collected by
	// `styles/style-entry.ts` and loaded via `<link rel="stylesheet">`
	// (`views/document.ts`). Nothing renders an inline `style=` attribute or
	// an inline `<style>` block, so no nonce or hash exception is needed.
	//
	// Svelte is compiled with `css: 'none'` (see `svelte-preload.ts`), which is
	// what keeps that true: any other CSS mode would deliver component styles
	// either as an injected `<style>` element or through `render().head`, and
	// both would need `'unsafe-inline'` here. `html-response.ts` throws if a
	// component emits head content, so a change of CSS mode fails loudly rather
	// than silently requiring this policy to be loosened.
	return `default-src 'self'; script-src ${scriptSrc}; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;
}
