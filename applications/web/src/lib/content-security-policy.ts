export function getContentSecurityPolicy(options: { allowScripts: boolean }): string {
	const scriptSrc = options.allowScripts ? "'self'" : "'none'";
	return `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'`;
}
