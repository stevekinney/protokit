import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
	existsSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	statSync,
	writeFileSync,
	readFileSync,
	chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	execute,
	encodeEnvironmentValue,
	writeSecretFileAtomic,
	SECRET_FILE_MODE,
	MANAGED_GITHUB_SECRETS,
} from './utilities.ts';

describe('execute', () => {
	test('passes shell metacharacters through as literal argv data, never interpreted by a shell', () => {
		// If this ever regressed to a shell-string implementation, `$(whoami)` would be
		// substituted with the real username instead of echoed verbatim.
		const output = execute('echo', ['$(whoami); rm -rf /tmp/should-not-run `date`']);
		expect(output).toBe('$(whoami); rm -rf /tmp/should-not-run `date`');
	});

	test('passes a value containing quotes and newlines through untouched', () => {
		const value = 'value with "quotes", a\nnewline, and a semicolon;';
		const output = execute('printf', ['%s', value]);
		expect(output).toBe(value.trim());
	});

	test('delivers secrets to a subprocess only via stdin, never argv', () => {
		const secret = 'super-secret-value-$(should-not-expand)';
		const output = execute('cat', [], { input: secret });
		expect(output).toBe(secret);
	});
});

describe('encodeEnvironmentValue', () => {
	test('leaves simple values unquoted', () => {
		expect(encodeEnvironmentValue('redis://localhost:6379')).toBe('redis://localhost:6379');
		expect(encodeEnvironmentValue('aws-us-east-2')).toBe('aws-us-east-2');
	});

	test('quotes a value containing a hash so it cannot truncate as a comment', () => {
		const encoded = encodeEnvironmentValue('a#b');
		expect(encoded.startsWith('"')).toBe(true);
		expect(encoded.endsWith('"')).toBe(true);
	});

	test('quotes an empty value', () => {
		expect(encodeEnvironmentValue('')).toBe('""');
	});
});

describe('environment file round trip', () => {
	let directory: string;
	let environmentFile: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-env-test-'));
		environmentFile = join(directory, '.env.local');
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	test('appendToEnvironmentFile then getEnvironmentValue round-trips values containing shell metacharacters', async () => {
		// utilities.ts derives ENVIRONMENT_FILE_PATH from import.meta.dirname at module load,
		// so this suite exercises the same read/write pair directly against a scratch file
		// rather than importing the module-level singleton path.
		const { appendEnvironmentEntryToFile, readEnvironmentEntriesFromFile } =
			await import('./environment-file.ts');

		const dangerousValues = [
			'value; rm -rf /',
			'value $(whoami)',
			'value `whoami`',
			'value with "double quotes"',
			'value\nwith\nnewlines',
			'   leading and trailing whitespace   ',
			'value#with-hash',
			'',
		];

		for (const [index, value] of dangerousValues.entries()) {
			appendEnvironmentEntryToFile(environmentFile, `KEY_${index}`, value);
		}

		const entries = readEnvironmentEntriesFromFile(environmentFile);
		for (const [index, value] of dangerousValues.entries()) {
			expect(entries[`KEY_${index}`]).toBe(value);
		}
	});

	test('updating an existing key never matches a key that is merely a substring suffix', async () => {
		const { appendEnvironmentEntryToFile, readEnvironmentEntriesFromFile } =
			await import('./environment-file.ts');

		appendEnvironmentEntryToFile(environmentFile, 'REFRESH_TOKEN', 'original-refresh');
		appendEnvironmentEntryToFile(environmentFile, 'TOKEN', 'original-token');
		appendEnvironmentEntryToFile(environmentFile, 'TOKEN', 'updated-token');

		const entries = readEnvironmentEntriesFromFile(environmentFile);
		expect(entries['REFRESH_TOKEN']).toBe('original-refresh');
		expect(entries['TOKEN']).toBe('updated-token');
	});

	test('written file is mode 0600', async () => {
		const { appendEnvironmentEntryToFile } = await import('./environment-file.ts');
		appendEnvironmentEntryToFile(environmentFile, 'SECRET', 'value');
		const mode = statSync(environmentFile).mode & 0o777;
		expect(mode).toBe(SECRET_FILE_MODE);
	});

	test('repairs permissions of an existing file written with looser permissions', async () => {
		const { appendEnvironmentEntryToFile } = await import('./environment-file.ts');
		writeFileSync(environmentFile, 'EXISTING=value\n', { mode: 0o644 });
		chmodSync(environmentFile, 0o644);
		expect(statSync(environmentFile).mode & 0o777).toBe(0o644);

		appendEnvironmentEntryToFile(environmentFile, 'NEW_KEY', 'new-value');

		expect(statSync(environmentFile).mode & 0o777).toBe(SECRET_FILE_MODE);
	});
});

describe('writeSecretFileAtomic', () => {
	let directory: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-secret-file-test-'));
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	test('writes with mode 0600', () => {
		const target = join(directory, 'secret.txt');
		writeSecretFileAtomic(target, 'hello');
		expect(statSync(target).mode & 0o777).toBe(SECRET_FILE_MODE);
		expect(existsSync(target)).toBe(true);
	});

	test('refuses to write through a symlink', () => {
		const real = join(directory, 'real-target.txt');
		const link = join(directory, 'link.txt');
		writeFileSync(real, 'original');
		symlinkSync(real, link);

		expect(() => writeSecretFileAtomic(link, 'poisoned')).toThrow();
	});

	test('does not leave a partial file behind on a symlink refusal', async () => {
		const real = join(directory, 'real-target-2.txt');
		const link = join(directory, 'link-2.txt');
		writeFileSync(real, 'original');
		symlinkSync(real, link);

		try {
			writeSecretFileAtomic(link, 'poisoned');
		} catch {
			// expected
		}

		await expect(Bun.file(real).text()).resolves.toBe('original');
	});
});

describe('MANAGED_GITHUB_SECRETS', () => {
	// Regression for a round-9 review finding (P2): `setup.ts`'s CI/CD phase
	// creates a `RAILWAY_TOKEN` GitHub secret (the only credential
	// `production.yml`'s `deploy` job uses), but this list -- the single
	// source `doctor.ts`, `teardown.ts`, and `rotate-secret.ts` all read --
	// never grew to include it, so `doctor` never flagged it missing,
	// `teardown` never offered to delete it, and `revoke-github RAILWAY_TOKEN`
	// refused to manage a secret setup itself created.
	test('includes RAILWAY_TOKEN', () => {
		expect(MANAGED_GITHUB_SECRETS).toContain('RAILWAY_TOKEN');
	});

	test('includes every GitHub secret setup.ts actually creates in its CI/CD phase', () => {
		const setupSource = readFileSync(new URL('./setup.ts', import.meta.url), 'utf8');
		const createdSecretNames = [...setupSource.matchAll(/setGithubSecret\(\s*'([A-Z0-9_]+)'/g)].map(
			(match) => match[1],
		);

		expect(createdSecretNames.length).toBeGreaterThan(0);
		for (const secretName of createdSecretNames) {
			expect(MANAGED_GITHUB_SECRETS as readonly string[]).toContain(secretName);
		}
	});
});
