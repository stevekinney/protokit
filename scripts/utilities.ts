import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import {
	appendEnvironmentEntryToFile,
	readEnvironmentEntriesFromFile,
	removeEnvironmentEntryFromFile,
} from './environment-file.ts';

export {
	encodeEnvironmentValue,
	writeSecretFileAtomic,
	SECRET_FILE_MODE,
} from './environment-file.ts';

export const ROOT_DIRECTORY = join(import.meta.dirname, '..');
export const ENVIRONMENT_FILE_PATH = join(ROOT_DIRECTORY, '.env.local');

export const MANAGED_GITHUB_SECRETS = [
	'NEON_PROJECT_ID',
	'NEON_API_KEY',
	'DATABASE_URL',
	'DATABASE_URL_UNPOOLED',
	'SESSION_SIGNING_SECRET',
	// A review finding (P2): `setup.ts`'s CI/CD phase has created this secret
	// (the only credential `production.yml`'s `deploy` job uses) since it
	// gained the `base-url`/Railway-deploy-job wiring, but this list -- the
	// single source `doctor.ts`, `teardown.ts`, and `rotate-secret.ts` all
	// read -- never grew to include it. `doctor` therefore never flagged it
	// missing, `teardown` never offered to delete it, and `revoke-github
	// RAILWAY_TOKEN` refused to manage a secret setup itself created.
	'RAILWAY_TOKEN',
] as const;

/**
 * Sets a GitHub Actions secret by piping the value over stdin — `gh secret set` reads stdin by
 * default, so the credential never appears as an argv element (visible in `ps`), in shell
 * history, or in a log line. Shared by `setup.ts` (initial delivery) and `rotate-secret.ts`
 * (rotation), which is also the revocation half of the same procedure via `teardown.ts`'s
 * `gh secret delete`.
 */
export function setGithubSecret(name: string, value: string) {
	execute('gh', ['secret', 'set', name], { input: value });
}

export function commandExists(command: string): boolean {
	try {
		execFileSync('which', [command], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

export interface ExecuteOptions {
	stdio?: 'inherit' | 'pipe';
	/** Piped to the child process's stdin instead of an argv value — the only way a secret
	 * should ever reach a subprocess from this codebase. */
	input?: string;
}

/**
 * Runs `command` with `arguments_` passed as an argv array — never as a shell string. Shell
 * metacharacters (quotes, `;`, `$()`, backticks, newlines) in any argument are passed through
 * to the child process as literal data, because there is no shell in between to interpret them.
 * SECRETS-001 (S-12): the previous implementation built a command string with template
 * interpolation and ran it through `execSync`, so a value like `` `rm -rf /` `` inside a
 * prompted region or `.env.local` value could execute.
 */
export function execute(
	command: string,
	arguments_: readonly string[] = [],
	options?: ExecuteOptions,
): string {
	const output = execFileSync(command, arguments_ as string[], {
		encoding: 'utf-8',
		stdio: options?.stdio === 'inherit' ? 'inherit' : ['pipe', 'pipe', 'pipe'],
		cwd: ROOT_DIRECTORY,
		input: options?.input,
	});

	return typeof output === 'string' ? output.trim() : '';
}

export function readEnvironmentFile(): Record<string, string> {
	return readEnvironmentEntriesFromFile(ENVIRONMENT_FILE_PATH);
}

export function getEnvironmentValue(key: string): string | undefined {
	return readEnvironmentFile()[key];
}

export function appendToEnvironmentFile(key: string, value: string) {
	appendEnvironmentEntryToFile(ENVIRONMENT_FILE_PATH, key, value);
}

export function removeFromEnvironmentFile(key: string) {
	removeEnvironmentEntryFromFile(ENVIRONMENT_FILE_PATH, key);
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

/**
 * Reads a line from stdin without echoing it to the terminal, so a credential typed at a
 * `promptSecret` prompt never appears in a terminal scrollback buffer, a recorded terminal
 * session, or a screen share. Falls back to a normal (echoed) read when stdin is not an
 * interactive TTY — e.g. a non-interactive `bun scripts/setup.ts < answers.txt` invocation —
 * because raw mode has no effect and no terminal is present to echo to anyway.
 */
export async function promptSecret(question: string): Promise<string> {
	if (!process.stdin.isTTY) {
		return prompt(question);
	}

	return new Promise((resolve) => {
		process.stdout.write(question);
		const chunks: Buffer[] = [];

		const stdin = process.stdin;
		const wasRaw = stdin.isRaw;
		stdin.setRawMode(true);
		stdin.resume();

		function onData(data: Buffer) {
			for (const byte of data) {
				if (byte === 3) {
					// Ctrl-C
					stdin.setRawMode(Boolean(wasRaw));
					stdin.pause();
					stdin.removeListener('data', onData);
					process.stdout.write('\n');
					process.exit(130);
				}
				if (byte === 13 || byte === 10) {
					// Enter / Return
					stdin.setRawMode(Boolean(wasRaw));
					stdin.pause();
					stdin.removeListener('data', onData);
					process.stdout.write('\n');
					resolve(Buffer.concat(chunks).toString('utf-8').trim());
					return;
				}
				if (byte === 127 || byte === 8) {
					// Backspace / Delete
					chunks.pop();
					continue;
				}
				chunks.push(Buffer.from([byte]));
			}
		}

		stdin.on('data', onData);
	});
}
