import { execSync } from 'node:child_process';
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
		execSync(`which ${command}`, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

export function execute(command: string, options?: { stdio?: 'inherit' | 'pipe' }): string {
	return execSync(command, {
		encoding: 'utf-8',
		stdio: options?.stdio || 'pipe',
		cwd: ROOT_DIRECTORY,
	}).trim();
}

export function readEnvironmentFile(): Record<string, string> {
	if (!existsSync(ENVIRONMENT_FILE_PATH)) return {};

	const content = readFileSync(ENVIRONMENT_FILE_PATH, 'utf-8');
	const result: Record<string, string> = {};

	for (const line of content.split('\n')) {
		if (!line.includes('=') || line.startsWith('#')) continue;
		const [key, ...valueParts] = line.split('=');
		if (key) result[key] = valueParts.join('=');
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
