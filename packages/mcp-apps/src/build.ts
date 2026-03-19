import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createApplicationHtml } from './html-shell.js';

const sourceDirectory = resolve(import.meta.dirname, 'applications');
const outputDirectory = resolve(import.meta.dirname, '..', 'dist');

mkdirSync(outputDirectory, { recursive: true });

const applicationDirectories = readdirSync(sourceDirectory, { withFileTypes: true }).filter(
	(entry) => entry.isDirectory(),
);

let hasErrors = false;

for (const directory of applicationDirectories) {
	const applicationName = directory.name;
	const entrypoint = join(sourceDirectory, applicationName, `${applicationName}.tsx`);

	const result = await Bun.build({
		entrypoints: [entrypoint],
		target: 'browser',
		minify: true,
		bundle: true,
	});

	if (!result.success) {
		console.error(`Build failed for ${applicationName}:`);
		for (const message of result.logs) {
			console.error(message);
		}
		hasErrors = true;
		continue;
	}

	const javascript = await result.outputs[0].text();
	const html = createApplicationHtml({ title: applicationName, javascript });

	writeFileSync(join(outputDirectory, `${applicationName}.html`), html);
	writeFileSync(
		join(outputDirectory, `${applicationName}.js`),
		`export default ${JSON.stringify(html)};\n`,
	);
	writeFileSync(
		join(outputDirectory, `${applicationName}.d.ts`),
		'declare const html: string;\nexport default html;\n',
	);

	console.log(`Built ${applicationName}`);
}

if (hasErrors) {
	process.exit(1);
}
