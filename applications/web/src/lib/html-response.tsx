import type { JSX } from 'react';
import { renderStaticDocument, renderStreamingDocument } from '@web/views/document';

export function createStaticHtmlResponse(input: {
	title: string;
	body: JSX.Element;
	status?: number;
}): Response {
	const markup = renderStaticDocument({
		title: input.title,
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
	title: string;
	body: JSX.Element;
	serverData?: Record<string, unknown>;
	status?: number;
}): Promise<Response> {
	const stream = await renderStreamingDocument({
		title: input.title,
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
