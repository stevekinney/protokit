import { execFileSync, execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export const ROOT_DIRECTORY = join(import.meta.dirname, '..');
export const ENVIRONMENT_FILE_PATH = join(ROOT_DIRECTORY, '.env.local');

export const MANAGED_GITHUB_SECRETS = [
	'NEON_PROJECT_ID',
	'NEON_API_KEY',
	'DATABASE_URL',
	'DATABASE_URL_UNPOOLED',
	'SKIP_ENV_VALIDATION',
] as const;

export function commandExists(command: string): boolean {
	try {
		execFileSync('which', [command], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

export function execute(command: string, options?: { stdio?: 'inherit' | 'pipe' }): string {
	const output = execSync(command, {
		encoding: 'utf-8',
		stdio: options?.stdio || 'pipe',
		cwd: ROOT_DIRECTORY,
	});

	return typeof output === 'string' ? output.trim() : '';
}

export function readEnvironmentFile(): Record<string, string> {
	if (!existsSync(ENVIRONMENT_FILE_PATH)) return {};

	const content = readFileSync(ENVIRONMENT_FILE_PATH, 'utf-8').replace(/\r\n?/g, '\n');
	const result: Record<string, string> = {};

	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		if (!line || !line.includes('=') || line.startsWith('#')) continue;
		const separatorIndex = line.indexOf('=');
		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		if (key) result[key] = value;
	}

	return result;
}

export function getEnvironmentValue(key: string): string | undefined {
	return readEnvironmentFile()[key];
}

export function appendToEnvironmentFile(key: string, value: string) {
	const line = `${key}=${value}\n`;

	if (existsSync(ENVIRONMENT_FILE_PATH)) {
		const content = readFileSync(ENVIRONMENT_FILE_PATH, 'utf-8');
		if (content.includes(`${key}=`)) {
			const updated = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
			writeFileSync(ENVIRONMENT_FILE_PATH, updated);
			return;
		}
		writeFileSync(ENVIRONMENT_FILE_PATH, content + line);
	} else {
		writeFileSync(ENVIRONMENT_FILE_PATH, line);
	}
}

export function removeFromEnvironmentFile(key: string) {
	if (!existsSync(ENVIRONMENT_FILE_PATH)) return;

	const content = readFileSync(ENVIRONMENT_FILE_PATH, 'utf-8');
	const updated = content
		.split('\n')
		.filter((line) => !line.startsWith(`${key}=`))
		.join('\n');

	writeFileSync(ENVIRONMENT_FILE_PATH, updated);
}

export function deleteEnvironmentFile() {
	if (existsSync(ENVIRONMENT_FILE_PATH)) {
		unlinkSync(ENVIRONMENT_FILE_PATH);
	}
}

export async function prompt(question: string): Promise<string> {
	const readline = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		readline.question(question, (answer) => {
			readline.close();
			resolve(answer.trim());
		});
	});
}

export async function confirm(question: string): Promise<boolean> {
	const answer = await prompt(question);
	return answer.toLowerCase() === 'y';
}
