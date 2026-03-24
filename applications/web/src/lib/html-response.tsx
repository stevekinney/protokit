import type { JSX } from 'react';
import type { DocumentMetadata } from '@web/views/document';
import { renderStaticDocument, renderStreamingDocument } from '@web/views/document';

export function createStaticHtmlResponse(input: {
	metadata: DocumentMetadata;
	body: JSX.Element;
	status?: number;
}): Response {
	const markup = renderStaticDocument({
		metadata: input.metadata,
		children: input.body,
	});

	return new Response(markup, {
		status: input.status ?? 200,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
		},
	});
}

export async function createStreamingHtmlResponse(input: {
	metadata: DocumentMetadata;
	body: JSX.Element;
	serverData?: Record<string, unknown>;
	status?: number;
}): Promise<Response> {
	const stream = await renderStreamingDocument({
		metadata: input.metadata,
		serverData: input.serverData,
		children: input.body,
	});

	return new Response(stream, {
		status: input.status ?? 200,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
		},
	});
}
