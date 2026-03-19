import { join, resolve } from 'node:path';
import { createApplicationHtml } from './html-shell.js';

const sourceDirectory = resolve(import.meta.dirname, 'applications');
const outputDirectory = resolve(import.meta.dirname, '..', 'dist');

const glob = new Bun.Glob('*/');
const applicationNames = [...glob.scanSync(sourceDirectory)].map((match) => match.slice(0, -1));

let hasErrors = false;

for (const applicationName of applicationNames) {
	const entrypoint = join(sourceDirectory, applicationName, `${applicationName}.tsx`);

	const result = await Bun.build({
		entrypoints: [entrypoint],
		target: 'browser',
		minify: true,
		sourcemap: 'none',
		splitting: false,
	});

	if (!result.success) {
		console.error(`Build failed for ${applicationName}:`);
		for (const message of result.logs) {
			console.error(message);
		}
		hasErrors = true;
		continue;
	}

	const javascriptOutput = result.outputs.find((output) => output.kind === 'entry-point');

	if (!javascriptOutput) {
		console.error(`No JavaScript output found for ${applicationName}`);
		hasErrors = true;
		continue;
	}

	const javascript = await javascriptOutput.text();
	const html = createApplicationHtml({ title: applicationName, javascript });

	await Bun.write(join(outputDirectory, `${applicationName}.html`), html);
	await Bun.write(
		join(outputDirectory, `${applicationName}.js`),
		`export default ${JSON.stringify(html)};\n`,
	);
	await Bun.write(
		join(outputDirectory, `${applicationName}.d.ts`),
		'declare const html: string;\nexport default html;\n',
	);

	console.log(`Built ${applicationName}`);
}

if (hasErrors) {
	process.exit(1);
}
