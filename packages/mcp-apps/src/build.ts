import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sveltePlugin } from '@lostgradient/bun-plugin-svelte';
import { createApplicationHtml } from './html-shell.js';

const sourceDirectory = resolve(import.meta.dirname, 'applications');
const outputDirectory = resolve(import.meta.dirname, '..', 'dist');

mkdirSync(outputDirectory, { recursive: true });

if (!existsSync(sourceDirectory)) {
	console.log('No applications directory found — nothing to build.');
	process.exit(0);
}

const glob = new Bun.Glob('*/');
const applicationNames = [...glob.scanSync(sourceDirectory)].map((match) => match.slice(0, -1));

if (applicationNames.length === 0) {
	console.log('No applications found — nothing to build.');
	process.exit(0);
}

let hasErrors = false;

for (const applicationName of applicationNames) {
	// Each application is a `{name}.ts` entry that mounts a `{name}.svelte`
	// component. The entry is the mount call rather than the component itself
	// because a client-compiled component does not mount itself.
	const entrypoint = join(sourceDirectory, applicationName, `${applicationName}.ts`);

	const result = await Bun.build({
		entrypoints: [entrypoint],
		target: 'browser',
		minify: true,
		sourcemap: 'none',
		splitting: false,
		// Required for any component library that ships its source behind the
		// `svelte` export condition; the plugin cannot add the condition itself.
		conditions: ['svelte'],
		// `'external'` so component styles come back as a real CSS artifact that
		// gets inlined into the single self-contained HTML document below,
		// rather than being appended to the document at runtime by the bundle.
		plugins: [sveltePlugin({ generate: 'client', css: 'external' })],
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
	const cssOutput = result.outputs.find((output) => output.path.endsWith('.css'));
	const css = cssOutput ? await cssOutput.text() : undefined;
	const html = createApplicationHtml({ title: applicationName, javascript, css });

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
