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
 * Review finding (P2, `scripts/environment-file.ts:195`): rewriting a key
 * that appears more than once in the file used to replace only the FIRST
 * occurrence. Both `readEnvironmentEntriesFromFile` (an assignment loop
 * that lets a later duplicate overwrite an earlier one in the returned
 * `Record`) and Bun's own dotenv loader use the LAST occurrence as the
 * effective value, so the old value on that later duplicate line stayed
 * authoritative at runtime even after `appendEnvironmentEntryToFile`
 * reported success -- e.g. rotating `SESSION_SIGNING_SECRET` against a
 * file with two occurrences wrote the new secret into the first line but
 * left the old one live on the second.
 */
describe('appendEnvironmentEntryToFile with a duplicated key', () => {
	let directory: string;
	let environmentFile: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-env-duplicate-test-'));
		environmentFile = join(directory, '.env.local');
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	test('collapses every duplicate occurrence of the rewritten key to a single, updated entry', () => {
		writeSecretFileAtomic(
			environmentFile,
			'SESSION_SIGNING_SECRET=old-first\nOTHER=untouched\nSESSION_SIGNING_SECRET=old-second\n',
		);

		appendEnvironmentEntryToFile(environmentFile, 'SESSION_SIGNING_SECRET', 'new-value');

		const rewrittenContent = readFileSync(environmentFile, 'utf-8');
		const occurrences = rewrittenContent
			.split('\n')
			.filter((line) => line.startsWith('SESSION_SIGNING_SECRET='));
		expect(occurrences).toEqual(['SESSION_SIGNING_SECRET=new-value']);
		expect(rewrittenContent).toContain('OTHER=untouched');

		// The parser's own LAST-occurrence-wins semantics must agree with
		// what actually got written -- there is now only one occurrence, so
		// this is no longer ambiguous either way.
		const parsed = readEnvironmentEntriesFromFile(environmentFile);
		expect(parsed['SESSION_SIGNING_SECRET']).toBe('new-value');
	});

	test("Bun's own .env loader reads the same value this rewrite reports for a file that started with a duplicate key", async () => {
		const dotEnvFile = join(directory, '.env');
		writeSecretFileAtomic(dotEnvFile, 'DUPLICATED_KEY=old-first\nDUPLICATED_KEY=old-second\n');

		appendEnvironmentEntryToFile(dotEnvFile, 'DUPLICATED_KEY', 'rotated-value');
		const parsed = readEnvironmentEntriesFromFile(dotEnvFile);
		expect(parsed['DUPLICATED_KEY']).toBe('rotated-value');

		const proc = Bun.spawn(
			['bun', '-e', 'console.log(JSON.stringify(process.env["DUPLICATED_KEY"]))'],
			{ cwd: directory, stdout: 'pipe' },
		);
		const output = (await new Response(proc.stdout).text()).trim();
		await proc.exited;
		expect(JSON.parse(output)).toBe('rotated-value');
	});
});

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

	// Round 10 review finding: a Bun-supported single-quoted value (e.g.
	// `GOOGLE_CLIENT_SECRET='abc#def'`) was falling through to the unquoted
	// branch above and getting truncated at the `#`.
	test('a single-quoted value keeps a literal hash -- never treated as a comment', () => {
		expect(decodeEnvironmentValue("'abc#def'")).toBe('abc#def');
	});

	test('a single-quoted value preserves leading/trailing whitespace inside the quotes', () => {
		expect(decodeEnvironmentValue("'  padded  '")).toBe('  padded  ');
	});

	test('a single-quoted value with no hash round-trips unchanged', () => {
		expect(decodeEnvironmentValue("'hello world'")).toBe('hello world');
	});

	test('an empty single-quoted value decodes to an empty string', () => {
		expect(decodeEnvironmentValue("''")).toBe('');
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

	test("Bun's own .env loader agrees with what this parser reads for a single-quoted value containing a hash", async () => {
		const dotEnvFile = join(directory, '.env');
		writeSecretFileAtomic(dotEnvFile, "GOOGLE_CLIENT_SECRET='abc#def'\n");

		const parsed = readEnvironmentEntriesFromFile(dotEnvFile);

		const proc = Bun.spawn(
			['bun', '-e', 'console.log(JSON.stringify(process.env["GOOGLE_CLIENT_SECRET"]))'],
			{ cwd: directory, stdout: 'pipe' },
		);
		const output = (await new Response(proc.stdout).text()).trim();
		await proc.exited;
		expect(JSON.parse(output)).toBe(parsed['GOOGLE_CLIENT_SECRET']);
		// The concrete corruption this fix prevents: the pre-fix parser
		// returned `'abc` (the leading quote retained, truncated at `#`).
		expect(parsed['GOOGLE_CLIENT_SECRET']).toBe('abc#def');
	});
});
