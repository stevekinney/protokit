export function getContentSecurityPolicy(options: { allowScripts: boolean }): string {
	const scriptSrc = options.allowScripts ? "'self'" : "'none'";
	// SEC-005 / S-17: `style-src` has no `'unsafe-inline'`. Every stylesheet
	// this server serves is the compiled Tailwind bundle loaded via
	// `<link rel="stylesheet">` (`views/document.tsx`); no component uses a
	// React `style={}` attribute (which would render as an inline `style=`
	// on the element) or an inline `<style>` block, so nothing requires a
	// nonce or hash exception.
	return `default-src 'self'; script-src ${scriptSrc}; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;
}
