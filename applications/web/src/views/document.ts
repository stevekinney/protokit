import { getAssetManifest } from '@web/lib/asset-manifest';

export type DocumentMetadata = {
	title: string;
	description?: string;
	canonicalUrl?: string;
	openGraph?: {
		title?: string;
		description?: string;
		image?: string;
		url?: string;
		type?: string;
	};
};

/**
 * This shell is built from template literals rather than by a component
 * framework, so nothing escapes interpolated values on its own -- that is this
 * function's job, and every interpolation below goes through it. Escaping the
 * quote characters as well as the angle brackets means the same helper is safe
 * in both text and attribute position.
 */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * `__SERVER_DATA__` is JSON inside a `<script>` element, whose content is
 * parsed as raw text. Escaping only `</` is not enough.
 *
 * A value containing `<!--<script>` puts the tokenizer into its
 * script-data-double-escaped state, where the element's own closing
 * `</script>` is no longer recognized as a terminator — so the rest of the
 * document, including the client bundle's `<script>` tag, is swallowed as
 * script text and hydration never runs. That value is reachable: an OAuth
 * client's registered display name permits angle brackets (see
 * `client-name-validation.ts`, which guards against confusables rather than
 * markup) and is serialized into this payload as a connection's `clientName`.
 *
 * Escaping every `<` and `>` as their JSON `\uXXXX` escapes makes it
 * impossible to open any tag-like construct, so no tokenizer state can be
 * entered in the first place. `JSON.parse` decodes them back to the original
 * characters, so the data the client receives is unchanged.
 */
export function escapeHtmlInJson(json: string): string {
	return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function renderMetaTag(property: string, content: string | undefined): string {
	if (!content) return '';
	return `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />`;
}

/**
 * Everything up to and including the opening `<body>` (plus the hydration
 * root when there is one).
 *
 * This is split from the tail so `createHtmlResponse` can flush it before the
 * page's data has been fetched -- see `src/lib/html-response.ts`.
 */
export function renderDocumentHead(input: {
	metadata: DocumentMetadata;
	stylesheetPath: string;
	bodyClassName?: string;
	includeClientBundle?: boolean;
}): string {
	const { metadata } = input;
	const bodyClass = input.bodyClassName ? ` class="${escapeHtml(input.bodyClassName)}"` : '';

	return (
		`<!doctype html><html lang="en"><head>` +
		`<meta charset="utf-8" />` +
		`<meta name="viewport" content="width=device-width, initial-scale=1" />` +
		`<link rel="icon" href="/favicon.png" />` +
		`<link rel="stylesheet" href="${escapeHtml(input.stylesheetPath)}" />` +
		`<title>${escapeHtml(metadata.title)}</title>` +
		(metadata.description
			? `<meta name="description" content="${escapeHtml(metadata.description)}" />`
			: '') +
		(metadata.canonicalUrl
			? `<link rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}" />`
			: '') +
		renderMetaTag('og:title', metadata.openGraph?.title) +
		renderMetaTag('og:description', metadata.openGraph?.description) +
		renderMetaTag('og:image', metadata.openGraph?.image) +
		renderMetaTag('og:url', metadata.openGraph?.url) +
		renderMetaTag('og:type', metadata.openGraph?.type) +
		`</head><body${bodyClass}>` +
		(input.includeClientBundle ? `<div id="application-root">` : '')
	);
}

/** Everything after the page body: the hydration payload and the client bundle. */
export function renderDocumentTail(input: {
	clientBundlePath: string;
	includeClientBundle?: boolean;
	serverData?: Record<string, unknown>;
}): string {
	return (
		(input.includeClientBundle ? `</div>` : '') +
		(input.serverData
			? `<script id="__SERVER_DATA__" type="application/json">` +
				escapeHtmlInJson(JSON.stringify(input.serverData)) +
				`</script>`
			: '') +
		(input.includeClientBundle
			? `<script src="${escapeHtml(input.clientBundlePath)}" defer></script>`
			: '') +
		`</body></html>`
	);
}

/** The whole document in one string, for pages that ship no client bundle. */
export function renderStaticDocument(input: {
	metadata: DocumentMetadata;
	bodyClassName?: string;
	body: string;
}): string {
	const manifest = getAssetManifest();

	return (
		renderDocumentHead({
			metadata: input.metadata,
			stylesheetPath: manifest.stylesheetPath,
			bodyClassName: input.bodyClassName,
		}) +
		input.body +
		renderDocumentTail({ clientBundlePath: manifest.clientBundlePath })
	);
}
