import type { JSX } from 'react';
import { renderDocument } from '@web/views/document';

export function createHtmlResponse(input: {
	title: string;
	body: JSX.Element;
	status?: number;
}): Response {
	const markup = renderDocument({
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
