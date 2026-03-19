export function createApplicationHtml(options: {
	title: string;
	javascript: string;
	css?: string;
}): string {
	const styleBlock = options.css ? `\n\t\t<style>${options.css}</style>` : '';

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>${options.title}</title>
		<style>
			:root { color-scheme: light dark; }
			* { margin: 0; padding: 0; box-sizing: border-box; }
			body { font-family: system-ui, -apple-system, sans-serif; }
		</style>${styleBlock}
	</head>
	<body>
		<div id="root"></div>
		<script type="module">${options.javascript}</script>
	</body>
</html>`;
}
