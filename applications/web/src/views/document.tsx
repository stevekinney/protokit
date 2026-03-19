import type { JSX, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function DocumentShell(input: {
	title: string;
	bodyClassName?: string;
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
			<body className={input.bodyClassName}>{input.children}</body>
		</html>
	);
}

export function renderDocument(input: {
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
