import { logger } from '@lostgradient/mcp/logger';
import type { Component } from 'svelte';
import { render } from 'svelte/server';
import { getAssetManifest } from '@web/lib/asset-manifest';
import type { DocumentMetadata } from '@web/views/document';
import { renderDocumentHead, renderDocumentTail, renderStaticDocument } from '@web/views/document';

/**
 * Svelte returns `<svelte:head>` content separately from the body, but this
 * application builds its `<head>` from `DocumentMetadata` and -- for streaming
 * responses -- flushes it before the body is ever rendered. Anything a
 * component tried to put in the head would therefore be silently dropped.
 *
 * Failing loudly instead catches a stray `<svelte:head>`, and would catch
 * component styles if the compiler were ever switched to `css: 'injected'`,
 * which delivers them this way.
 *
 * It does NOT catch a `<style>` block under the `css: 'none'` this application
 * actually compiles with -- those are discarded before they could reach the
 * head. `styles/style-entry.test.ts` rejects them instead.
 */
function assertEmptyHead(head: string, componentName: string): void {
	if (head !== '') {
		throw new Error(
			`${componentName} rendered <head> content, which this application's document shell ` +
				`cannot deliver: the head is built from DocumentMetadata and is flushed before the ` +
				`body renders. Move the value into the route's DocumentMetadata instead. ` +
				`Received: ${head}`,
		);
	}
}

/**
 * A page with no client bundle at all. Used for the OAuth consent screen, the
 * legal pages, and error pages, which are served under `script-src 'none'`.
 */
export function createStaticHtmlResponse<Props extends Record<string, unknown>>(input: {
	metadata: DocumentMetadata;
	component: Component<Props>;
	props: Props;
	status?: number;
}): Response {
	const rendered = render(input.component, { props: input.props });
	assertEmptyHead(rendered.head, input.component.name || 'component');

	const markup = renderStaticDocument({ metadata: input.metadata, body: rendered.body });

	return new Response(markup, {
		status: input.status ?? 200,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

/**
 * A hydrated page, streamed shell-first.
 *
 * The document head is enqueued immediately, before `resolvePage` runs, so the
 * browser can start fetching the stylesheet while the server is still doing
 * its data work. Svelte has no streaming renderer -- `svelte/server` exports
 * only a synchronous `render()` -- so the body itself arrives in one chunk.
 * The win is the early head flush.
 *
 * `resolvePage` returns `serverData`, which is used as BOTH the props for the
 * server render and the payload the client hydrates from. Keeping them the
 * same object is what makes a hydration mismatch structurally impossible.
 */
export async function createStreamingHtmlResponse<Props extends Record<string, unknown>>(input: {
	metadata: DocumentMetadata;
	resolvePage: () => Promise<{ component: Component<Props>; serverData: Props }>;
	status?: number;
}): Promise<Response> {
	const manifest = getAssetManifest();
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			controller.enqueue(
				encoder.encode(
					renderDocumentHead({
						metadata: input.metadata,
						stylesheetPath: manifest.stylesheetPath,
						includeClientBundle: true,
					}),
				),
			);

			try {
				const { component, serverData } = await input.resolvePage();
				const rendered = render(component, { props: serverData });
				assertEmptyHead(rendered.head, component.name || 'component');

				controller.enqueue(encoder.encode(rendered.body));
				controller.enqueue(
					encoder.encode(
						renderDocumentTail({
							clientBundlePath: manifest.clientBundlePath,
							includeClientBundle: true,
							serverData,
						}),
					),
				);
				controller.close();
			} catch (error) {
				// The head is already on the wire, so the status line and headers
				// are committed and there is no way to turn this into a 500. Abort
				// the stream instead: the client sees a truncated response rather
				// than a silently half-rendered page that looks successful.
				//
				// Log it here, though. Erroring the stream happens after the
				// request handler has already returned, so the dispatch layer's
				// own error handling never sees this and the request was already
				// recorded with the status the head was flushed with. Without
				// this, a failed page query or render is invisible in operational
				// logs -- it looks like a successful 200.
				logger.error(
					{ err: error, event: 'page_render', outcome: 'failed_after_flush' },
					'Page render failed after the document head was flushed',
				);
				controller.error(error);
			}
		},
	});

	return new Response(stream, {
		status: input.status ?? 200,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}
