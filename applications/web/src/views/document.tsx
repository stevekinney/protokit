import type { JSX, ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { renderToStaticMarkup } from 'react-dom/server';

export function escapeHtmlInJson(json: string): string {
	return json.replace(/<\//g, '<\\/');
}

function DocumentShell(input: {
	title: string;
	bodyClassName?: string;
	includeClientBundle?: boolean;
	serverData?: Record<string, unknown>;
	children: ReactNode;
}): JSX.Element {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="icon" href="/favicon.png" />
				<link rel="stylesheet" href="/assets/application.css" />
				<title>{input.title}</title>
			</head>
			<body className={input.bodyClassName}>
				{input.includeClientBundle ? (
					<div id="application-root">{input.children}</div>
				) : (
					input.children
				)}
				{input.serverData && (
					<script
						id="__SERVER_DATA__"
						type="application/json"
						dangerouslySetInnerHTML={{
							__html: escapeHtmlInJson(JSON.stringify(input.serverData)),
						}}
					/>
				)}
				{input.includeClientBundle && <script src="/assets/client.js" defer />}
			</body>
		</html>
	);
}

export function renderStaticDocument(input: {
	title: string;
	bodyClassName?: string;
	children: ReactNode;
}): string {
	const markup = renderToStaticMarkup(
		<DocumentShell title={input.title} bodyClassName={input.bodyClassName}>
			{input.children}
		</DocumentShell>,
	);

	return `<!doctype html>${markup}`;
}

export async function renderStreamingDocument(input: {
	title: string;
	bodyClassName?: string;
	serverData?: Record<string, unknown>;
	children: ReactNode;
}): Promise<ReadableStream> {
	const stream = await renderToReadableStream(
		<DocumentShell
			title={input.title}
			bodyClassName={input.bodyClassName}
			includeClientBundle={true}
			serverData={input.serverData}
		>
			{input.children}
		</DocumentShell>,
		{
			bootstrapScripts: [],
		},
	);

	const doctype = new TextEncoder().encode('<!doctype html>');
	const doctypeStream = new ReadableStream({
		start(controller) {
			controller.enqueue(doctype);
			controller.close();
		},
	});

	return concatStreams(doctypeStream, stream);
}

function concatStreams(
	first: ReadableStream<Uint8Array>,
	second: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
	const firstReader = first.getReader();
	const secondReader = second.getReader();
	let readingFirst = true;

	return new ReadableStream({
		async pull(controller) {
			if (readingFirst) {
				const { done, value } = await firstReader.read();
				if (done) {
					readingFirst = false;
					const result = await secondReader.read();
					if (result.done) {
						controller.close();
					} else {
						controller.enqueue(result.value);
					}
				} else {
					controller.enqueue(value);
				}
			} else {
				const { done, value } = await secondReader.read();
				if (done) {
					controller.close();
				} else {
					controller.enqueue(value);
				}
			}
		},
	});
}
