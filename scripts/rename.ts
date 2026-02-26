import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const TARGET_EXTENSIONS = ['.json', '.ts', '.js', '.svelte', '.md'];
const IGNORE_DIRECTORIES = ['node_modules', '.svelte-kit', '.turbo', 'build', 'dist', '.git'];

async function collectFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORE_DIRECTORIES.includes(entry.name)) {
				files.push(...(await collectFiles(fullPath)));
			}
		} else if (TARGET_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
			files.push(fullPath);
		}
	}

	return files;
}

async function main() {
	const newScope = process.argv[2];

	if (!newScope) {
		console.error('Usage: bun scripts/rename.ts @scope/app-name');
		console.error('Example: bun scripts/rename.ts @acme/my-app');
		process.exit(1);
	}

	const scopeMatch = newScope.match(/^@([^/]+)\//);
	if (!scopeMatch) {
		console.error('Invalid scope format. Expected: @scope/app-name');
		process.exit(1);
	}

	const newScopePrefix = `@${scopeMatch[1]}`;
	const rootDirectory = join(import.meta.dirname, '..');
	const files = await collectFiles(rootDirectory);
	const changedFiles: string[] = [];

	for (const filePath of files) {
		const content = await readFile(filePath, 'utf-8');
		const updated = content.replaceAll('@template/', `${newScopePrefix}/`);

		if (updated !== content) {
			await writeFile(filePath, updated, 'utf-8');
			changedFiles.push(relative(rootDirectory, filePath));
		}
	}

	if (changedFiles.length === 0) {
		console.log('No files needed updating.');
	} else {
		console.log(`Updated ${changedFiles.length} files:`);
		for (const file of changedFiles) {
			console.log(`  ${file}`);
		}
	}
}

main();
