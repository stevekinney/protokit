import type { JSX, ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { renderToStaticMarkup } from 'react-dom/server';
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

export function escapeHtmlInJson(json: string): string {
	return json.replace(/<\//g, '<\\/');
}

function DocumentShell(input: {
	metadata: DocumentMetadata;
	stylesheetPath: string;
	clientBundlePath: string;
	bodyClassName?: string;
	includeClientBundle?: boolean;
	serverData?: Record<string, unknown>;
	children: ReactNode;
}): JSX.Element {
	const { metadata } = input;

	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="icon" href="/favicon.png" />
				<link rel="stylesheet" href={input.stylesheetPath} />
				<title>{metadata.title}</title>
				{metadata.description && <meta name="description" content={metadata.description} />}
				{metadata.canonicalUrl && <link rel="canonical" href={metadata.canonicalUrl} />}
				{metadata.openGraph?.title && (
					<meta property="og:title" content={metadata.openGraph.title} />
				)}
				{metadata.openGraph?.description && (
					<meta property="og:description" content={metadata.openGraph.description} />
				)}
				{metadata.openGraph?.image && (
					<meta property="og:image" content={metadata.openGraph.image} />
				)}
				{metadata.openGraph?.url && <meta property="og:url" content={metadata.openGraph.url} />}
				{metadata.openGraph?.type && <meta property="og:type" content={metadata.openGraph.type} />}
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
				{input.includeClientBundle && <script src={input.clientBundlePath} defer />}
			</body>
		</html>
	);
}

export function renderStaticDocument(input: {
	metadata: DocumentMetadata;
	bodyClassName?: string;
	children: ReactNode;
}): string {
	const manifest = getAssetManifest();
	const markup = renderToStaticMarkup(
		<DocumentShell
			metadata={input.metadata}
			stylesheetPath={manifest.stylesheetPath}
			clientBundlePath={manifest.clientBundlePath}
			bodyClassName={input.bodyClassName}
		>
			{input.children}
		</DocumentShell>,
	);

	return `<!doctype html>${markup}`;
}

export async function renderStreamingDocument(input: {
	metadata: DocumentMetadata;
	bodyClassName?: string;
	serverData?: Record<string, unknown>;
	children: ReactNode;
}): Promise<ReadableStream> {
	const manifest = getAssetManifest();
	const reactStream = await renderToReadableStream(
		<DocumentShell
			metadata={input.metadata}
			stylesheetPath={manifest.stylesheetPath}
			clientBundlePath={manifest.clientBundlePath}
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

	const doctypeBytes = new TextEncoder().encode('<!doctype html>');
	const reader = reactStream.getReader();

	return new ReadableStream({
		start(controller) {
			controller.enqueue(doctypeBytes);
		},
		async pull(controller) {
			const { done, value } = await reader.read();
			if (done) controller.close();
			else controller.enqueue(value);
		},
	});
}
