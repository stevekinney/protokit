import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { parseArguments } from '@web/deployed-streaming';

/**
 * Review finding (P2, `deployed-oauth.ts:387`): a bearer token printed
 * inline as `--token TOKEN` lands in shell history and, once the printed
 * command actually runs, in this process's own argv for its whole
 * lifetime. `deployed-oauth.ts` now hands the token off through a
 * mode-0600 file instead; `--token-file PATH` is what reads it back
 * without ever putting the raw value on a command line.
 */
describe('parseArguments', () => {
	let directory: string | undefined;

	afterEach(() => {
		if (directory) {
			rmSync(directory, { recursive: true, force: true });
			directory = undefined;
		}
	});

	it('reads and trims the token from --token-file', () => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-deployed-streaming-test-'));
		const tokenFilePath = join(directory, 'token');
		writeFileSync(tokenFilePath, 'real-token-value\n', { mode: 0o600 });
		chmodSync(tokenFilePath, 0o600);

		const result = parseArguments([
			'https://deployment.example/mcp',
			'--token-file',
			tokenFilePath,
		]);
		expect(result).toEqual({ mcpUrl: 'https://deployment.example/mcp', token: 'real-token-value' });
	});

	it('still accepts a bare --token for a token a human already has', () => {
		const result = parseArguments([
			'https://deployment.example/mcp',
			'--token',
			'real-token-value',
		]);
		expect(result).toEqual({ mcpUrl: 'https://deployment.example/mcp', token: 'real-token-value' });
	});

	it('prefers --token-file over --token when both are given', () => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-deployed-streaming-test-'));
		const tokenFilePath = join(directory, 'token');
		writeFileSync(tokenFilePath, 'from-file', { mode: 0o600 });
		chmodSync(tokenFilePath, 0o600);

		const result = parseArguments([
			'https://deployment.example/mcp',
			'--token-file',
			tokenFilePath,
			'--token',
			'from-argv',
		]);
		expect(result.token).toBe('from-file');
	});
});
