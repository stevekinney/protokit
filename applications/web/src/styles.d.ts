/**
 * `style-entry.ts` imports stylesheets for their side effect so the bundler
 * pulls them into the CSS graph. TypeScript has no notion of a CSS module, so
 * it needs to be told these imports contribute no bindings rather than
 * failing to resolve them.
 */
declare module '*.css' {
	const stylesheet: string;
	export default stylesheet;
}
