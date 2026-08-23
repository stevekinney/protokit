import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	decodeEnvironmentValue,
	parseEnvironmentEntries,
	appendEnvironmentEntryToFile,
	readEnvironmentEntriesFromFile,
	writeSecretFileAtomic,
} from './environment-file.ts';

/**
 * A P2 review finding: `PORT=3000 # local` was parsed as the literal value
 * `3000 # local` -- the inline comment became part of the runtime value --
 * and any later rewrite of the file (updating a different key) then
 * re-serialized that corrupted value, quoting it as `PORT="3000 # local"`
 * and permanently baking the comment text in. `decodeEnvironmentValue`'s
 * unquoted branch now follows the same dotenv-style semantics Bun's own
 * `.env` loader uses: an unquoted `#` starts a comment running to end of
 * line (confirmed directly against `bun run` reading a real `.env` file,
 * not assumed), regardless of whether it's preceded by whitespace. A
 * quoted value's `#` is never treated as a comment, matching the
 * pre-existing quoted-value behavior.
 */
describe('decodeEnvironmentValue', () => {
	test('strips a space-separated inline comment', () => {
		expect(decodeEnvironmentValue('3000 # local')).toBe('3000');
	});

	test('strips a comment with no preceding whitespace', () => {
		expect(decodeEnvironmentValue('value#nocomment')).toBe('value');
	});

	test('strips everything from the first hash, including a second hash', () => {
		expect(decodeEnvironmentValue('value#one#two')).toBe('value');
	});

	test('a value that is only a comment decodes to an empty string', () => {
		expect(decodeEnvironmentValue('#leadinghash')).toBe('');
		expect(decodeEnvironmentValue('   # only a comment')).toBe('');
	});

	test('a value with no hash at all is unaffected', () => {
		expect(decodeEnvironmentValue('redis://localhost:6379')).toBe('redis://localhost:6379');
	});

	test('a quoted value keeps a literal hash -- never treated as a comment', () => {
		expect(decodeEnvironmentValue('"value # not a comment"')).toBe('value # not a comment');
	});
});

describe('parseEnvironmentEntries', () => {
	test('an unquoted inline comment does not become part of the parsed value', () => {
		const entries = parseEnvironmentEntries('PORT=3000 # local\n');
		expect(entries).toHaveLength(1);
		expect(entries[0]?.key).toBe('PORT');
		expect(entries[0]?.value).toBe('3000');
	});

	test('a standalone comment line is still preserved as a comment, not a key', () => {
		const entries = parseEnvironmentEntries('# a real comment line\nPORT=3000\n');
		expect(entries).toHaveLength(2);
		expect(entries[0]?.key).toBeUndefined();
		expect(entries[1]?.key).toBe('PORT');
		expect(entries[1]?.value).toBe('3000');
	});
});

describe('rewriting a file with an unquoted inline comment', () => {
	let directory: string;
	let environmentFile: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-env-comment-test-'));
		environmentFile = join(directory, '.env.local');
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	test('a rewrite triggered by an unrelated key does not corrupt a value that had an inline comment', () => {
		writeSecretFileAtomic(environmentFile, 'PORT=3000 # local\nOTHER=original\n');

		// Any rewrite of the file -- here, updating a completely different
		// key -- re-serializes every entry, including PORT.
		appendEnvironmentEntryToFile(environmentFile, 'OTHER', 'updated');

		const entries = readEnvironmentEntriesFromFile(environmentFile);
		expect(entries['PORT']).toBe('3000');
		expect(entries['OTHER']).toBe('updated');

		// The bug's concrete, observable failure mode: PORT must never be
		// rewritten as a quoted string that carries the comment text as
		// part of the runtime value.
		const rewrittenContent = readFileSync(environmentFile, 'utf-8');
		expect(rewrittenContent).not.toContain('PORT="3000 # local"');
		expect(rewrittenContent).toContain('PORT=3000');
	});

	test("Bun's own .env loader agrees with what this parser reads for the same file", async () => {
		// `.env` (not `.env.local`) on purpose: Bun skips auto-loading
		// `.env.local` when `NODE_ENV=test` (to avoid a developer's local
		// overrides leaking into a test run), and `bun test` itself sets
		// `NODE_ENV=test`, which the spawned child below inherits. `.env`
		// has no such carve-out, so it is loaded regardless of `NODE_ENV`.
		const dotEnvFile = join(directory, '.env');
		writeSecretFileAtomic(dotEnvFile, 'PORT=3000 # local\n');

		const parsed = readEnvironmentEntriesFromFile(dotEnvFile);

		const proc = Bun.spawn(['bun', '-e', 'console.log(JSON.stringify(process.env["PORT"]))'], {
			cwd: directory,
			stdout: 'pipe',
		});
		const output = (await new Response(proc.stdout).text()).trim();
		await proc.exited;
		expect(JSON.parse(output)).toBe(parsed['PORT']);
	});
});
