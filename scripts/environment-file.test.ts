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

/**
 * Round 14 review finding (P2, `scripts/environment-file.ts:30`): a
 * double-quoted value followed by a same-line inline comment (e.g.
 * `SECRET="abc#def" # note`) failed the `endsWith('"')` check that used to
 * decide whether a value was quoted, fell into the unquoted-comment
 * branch, and truncated at the FIRST `#` -- including one legitimately
 * inside the quotes -- corrupting the decoded value to `"abc` and baking
 * that corruption in permanently on the very next rewrite.
 */
describe('parsing a quoted value followed by a same-line inline comment', () => {
	test('a double-quoted value keeps a `#` inside the quotes and drops a trailing comment', () => {
		const entries = parseEnvironmentEntries('SECRET="abc#def" # note\n');
		expect(entries[0]).toEqual({
			key: 'SECRET',
			raw: 'SECRET="abc#def" # note',
			value: 'abc#def',
		});
	});

	test('a single-quoted value keeps a `#` inside the quotes and drops a trailing comment', () => {
		const entries = parseEnvironmentEntries("SECRET='abc#def' # note\n");
		expect(entries[0]?.value).toBe('abc#def');
	});

	test('a trailing comment with no space before the `#` is still recognized', () => {
		const entries = parseEnvironmentEntries('SECRET="abc#def"#nospace\n');
		expect(entries[0]?.value).toBe('abc#def');
	});

	test('a quoted value followed by only trailing whitespace decodes with no comment', () => {
		const entries = parseEnvironmentEntries('SECRET="abc#def"   \n');
		expect(entries[0]?.value).toBe('abc#def');
	});

	test('a rewrite triggered by an unrelated key does not corrupt a quoted value with an inline comment', () => {
		const directory = mkdtempSync(join(tmpdir(), 'protokit-env-quoted-comment-test-'));
		try {
			const environmentFile = join(directory, '.env.local');
			writeSecretFileAtomic(environmentFile, 'SECRET="abc#def" # note\nOTHER=original\n');

			appendEnvironmentEntryToFile(environmentFile, 'OTHER', 'updated');

			const entries = readEnvironmentEntriesFromFile(environmentFile);
			expect(entries['SECRET']).toBe('abc#def');
			expect(entries['OTHER']).toBe('updated');
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('a multi-line quoted value followed by a trailing comment on its closing line decodes and drops the comment (sibling defect, same root cause)', () => {
		const entries = parseEnvironmentEntries('CERT="line1\nline2" # comment\nOTHER=value\n');
		expect(entries.find((entry) => entry.key === 'CERT')?.value).toBe('line1\nline2');
		expect(entries.find((entry) => entry.key === 'OTHER')?.value).toBe('value');
	});

	test('a quoted value followed by other, non-comment trailing text falls back to the literal unquoted value on that line only', () => {
		const entries = parseEnvironmentEntries('F="abc" trailing text\nNEXT=ok\n');
		expect(entries.find((entry) => entry.key === 'F')?.value).toBe('"abc" trailing text');
		expect(entries.find((entry) => entry.key === 'NEXT')?.value).toBe('ok');
	});

	test("Bun's own .env loader agrees with what this parser reads for a quoted value with a trailing inline comment", async () => {
		const directory = mkdtempSync(join(tmpdir(), 'protokit-env-quoted-comment-bun-test-'));
		try {
			const dotEnvFile = join(directory, '.env');
			writeSecretFileAtomic(dotEnvFile, 'SECRET="abc#def" # note\n');

			const parsed = readEnvironmentEntriesFromFile(dotEnvFile);

			const proc = Bun.spawn(['bun', '-e', 'console.log(JSON.stringify(process.env["SECRET"]))'], {
				cwd: directory,
				stdout: 'pipe',
			});
			const output = (await new Response(proc.stdout).text()).trim();
			await proc.exited;
			expect(JSON.parse(output)).toBe(parsed['SECRET']);
			expect(parsed['SECRET']).toBe('abc#def');
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

/**
 * Round 14 review: this parser has now had five separate rounds of "one more
 * quoting/comment shape Bun handles that this parser didn't" findings
 * (inline comments, single quotes, duplicate keys, multiline values, an
 * `export` prefix, and now a quoted value with a trailing comment). Each
 * prior fix added one more targeted example-based test rather than closing
 * the class. This is a property-style sweep instead: a table of
 * representative `.env` bodies covering every quoting/comment shape this
 * file's own history has found a bug in, each compared directly against a
 * real `bun -e` subprocess reading the same file -- not against this
 * parser's own idea of what it should produce. A shape not in this table
 * could still diverge, but every shape a real review round has ever
 * flagged here is now pinned against Bun's actual behavior in one place,
 * rather than scattered across one-off tests that could each individually
 * be satisfied by a parser that special-cases exactly the reported example.
 */
describe("property-style parity against Bun's own .env loader", () => {
	const cases: Array<{ name: string; content: string; keys: string[] }> = [
		{ name: 'unquoted value with inline comment', content: 'PORT=3000 # local\n', keys: ['PORT'] },
		{ name: 'unquoted value with no comment', content: 'PLAIN=value\n', keys: ['PLAIN'] },
		{
			name: 'unquoted value with a hash and no preceding space',
			content: 'A=value#nocomment\n',
			keys: ['A'],
		},
		{
			name: 'double-quoted value containing a hash',
			content: 'SECRET="abc#def"\n',
			keys: ['SECRET'],
		},
		{
			name: 'double-quoted value containing a hash with a trailing comment',
			content: 'SECRET="abc#def" # note\n',
			keys: ['SECRET'],
		},
		{
			name: 'double-quoted value containing a hash with an unspaced trailing comment',
			content: 'SECRET="abc#def"#note\n',
			keys: ['SECRET'],
		},
		{
			name: 'single-quoted value containing a hash',
			content: "SECRET='abc#def'\n",
			keys: ['SECRET'],
		},
		{
			name: 'single-quoted value containing a hash with a trailing comment',
			content: "SECRET='abc#def' # note\n",
			keys: ['SECRET'],
		},
		{
			name: 'double-quoted value with trailing whitespace only',
			content: 'SECRET="abc#def"   \n',
			keys: ['SECRET'],
		},
		{
			// Only `\n`/`\r` are exercised here, not `\"`/`\\`: this sweep found
			// that Bun's own loader does NOT unescape `\"` or `\\` inside a
			// double-quoted value (both stay literal backslash-plus-character at
			// runtime), while this parser's `decodeQuotedInner` does unescape
			// them, matching `encodeEnvironmentValue`'s own output on the write
			// side. That divergence is a real, separate defect from the one this
			// round fixes -- reported to the reviewer rather than silently
			// patched here, since the correct fix changes this file's escaping
			// contract for every value containing a literal quote or backslash,
			// which is a bigger, more consequential decision than this item's
			// scope covers.
			name: 'double-quoted value with a newline escape',
			content: 'SECRET="line1\\nline2"\n',
			keys: ['SECRET'],
		},
		{
			name: 'multi-line double-quoted value',
			content: 'CERT="line1\nline2"\nOTHER=value\n',
			keys: ['CERT', 'OTHER'],
		},
		{
			name: 'multi-line double-quoted value with a trailing comment on its closing line',
			content: 'CERT="line1\nline2" # comment\nOTHER=value\n',
			keys: ['CERT', 'OTHER'],
		},
		{
			name: 'multi-line single-quoted value',
			content: "CERT='line1\nline2'\nOTHER=value\n",
			keys: ['CERT', 'OTHER'],
		},
		{
			name: 'export-prefixed entry',
			content: 'export SESSION_SIGNING_SECRET=abc123\n',
			keys: ['SESSION_SIGNING_SECRET'],
		},
		{
			name: 'duplicated key uses the last occurrence',
			content: 'DUPLICATE=first\nDUPLICATE=second\n',
			keys: ['DUPLICATE'],
		},
		{
			name: 'empty double-quoted value',
			content: 'EMPTY=""\n',
			keys: ['EMPTY'],
		},
		{
			name: 'leading hash makes the whole value a comment',
			content: 'D=#leadinghash\n',
			keys: ['D'],
		},
	];

	for (const { name, content, keys } of cases) {
		test(`matches Bun's own .env loader: ${name}`, async () => {
			const directory = mkdtempSync(join(tmpdir(), 'protokit-env-parity-test-'));
			try {
				const dotEnvFile = join(directory, '.env');
				writeSecretFileAtomic(dotEnvFile, content);

				const parsed = readEnvironmentEntriesFromFile(dotEnvFile);

				const script = `console.log(JSON.stringify(${JSON.stringify(keys)}.map((key) => process.env[key])))`;
				const proc = Bun.spawn(['bun', '-e', script], { cwd: directory, stdout: 'pipe' });
				const output = (await new Response(proc.stdout).text()).trim();
				await proc.exited;
				const bunValues: Array<string | undefined> = JSON.parse(output);

				for (const [index, key] of keys.entries()) {
					expect(parsed[key]).toBe(bunValues[index]);
				}
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		});
	}
});

/**
 * Round 13 review finding (P2, `scripts/environment-file.ts:107`): a
 * Bun-supported multiline quoted value -- a literal newline embedded
 * between the quotes, written across two physical lines in the file -- was
 * parsed by splitting the file into physical lines FIRST. The opening
 * line was read as the complete value (with the stray leading quote
 * character kept literally, since it never closed on that line), and the
 * continuation line was left behind as unrelated raw text; any later
 * rewrite of a DIFFERENT key then serialized the corrupted value
 * (`CERT="\"line1"`), permanently destroying the certificate on the very
 * next unrelated rotation.
 */
describe('parsing and rewriting a file with a multiline quoted value', () => {
	let directory: string;
	let environmentFile: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-env-multiline-test-'));
		environmentFile = join(directory, '.env.local');
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	test('reads a double-quoted value that spans two physical lines as one value joined by a real newline', () => {
		const entries = parseEnvironmentEntries('CERT="line1\nline2"\nOTHER=value\n');
		expect(entries).toEqual([
			{ key: 'CERT', raw: 'CERT="line1\nline2"', value: 'line1\nline2' },
			{ key: 'OTHER', raw: 'OTHER=value', value: 'value' },
		]);
	});

	test('reads a single-quoted value that spans two physical lines as one value joined by a real newline', () => {
		const entries = parseEnvironmentEntries("CERT='line1\nline2'\nOTHER=value\n");
		expect(entries.find((entry) => entry.key === 'CERT')?.value).toBe('line1\nline2');
	});

	test('a rewrite triggered by an unrelated key does not corrupt a multiline quoted value', () => {
		writeSecretFileAtomic(environmentFile, 'CERT="line1\nline2"\nOTHER=original\n');

		appendEnvironmentEntryToFile(environmentFile, 'OTHER', 'updated');

		const entries = readEnvironmentEntriesFromFile(environmentFile);
		// The bug's concrete, observable failure mode: the pre-fix parser
		// reported CERT as `"line1` (the stray opening quote kept literally)
		// and re-serialized it as `CERT="\"line1"`, permanently corrupting it.
		expect(entries['CERT']).toBe('line1\nline2');
		expect(entries['OTHER']).toBe('updated');
	});

	test('falls back to reading only the first physical line when the quote never closes, matching a value with no continuation', () => {
		const entries = parseEnvironmentEntries('CERT="line1\nline2\nOTHER=value\n');
		const cert = entries.find((entry) => entry.key === 'CERT');
		expect(cert?.value).toBe('"line1');
		expect(entries.find((entry) => entry.key === 'OTHER')?.value).toBe('value');
	});

	test("Bun's own .env loader agrees with what this parser reads for a value spanning two physical lines", async () => {
		// `.env` (not `.env.local`): Bun skips auto-loading `.env.local`
		// under `NODE_ENV=test`, which the spawned child below inherits.
		const dotEnvFile = join(directory, '.env');
		writeSecretFileAtomic(dotEnvFile, 'CERT="line1\nline2"\n');

		const parsed = readEnvironmentEntriesFromFile(dotEnvFile);

		const proc = Bun.spawn(['bun', '-e', 'console.log(JSON.stringify(process.env["CERT"]))'], {
			cwd: directory,
			stdout: 'pipe',
		});
		const output = (await new Response(proc.stdout).text()).trim();
		await proc.exited;
		expect(JSON.parse(output)).toBe(parsed['CERT']);
		expect(parsed['CERT']).toBe('line1\nline2');
	});
});

/**
 * Round 13 review finding (P2, `scripts/environment-file.ts:116`): a
 * Bun-supported `export KEY=value` entry (used, for example, when a
 * developer sources `.env.local` directly in a shell) was recorded with
 * the key `export KEY` -- the literal string, `export` and all -- so
 * `readEnvironmentEntriesFromFile` reported the real key as absent.
 * `rotate-secret.ts`'s session-key rotation looks up
 * `SESSION_SIGNING_SECRET` by its exact name before copying it into
 * `SESSION_SIGNING_SECRET_PREVIOUS`; failing to recognize an `export`-
 * prefixed entry meant rotation silently generated a new current secret
 * with no outgoing value to overlap with, invalidating every existing
 * session and pending OAuth state immediately instead of providing the
 * promised overlap window.
 */
describe('parsing and rewriting a file with an export-prefixed entry', () => {
	let directory: string;
	let environmentFile: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-env-export-test-'));
		environmentFile = join(directory, '.env.local');
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	test('recognizes the key of an export-prefixed entry, not the literal "export KEY" string', () => {
		const entries = parseEnvironmentEntries('export SESSION_SIGNING_SECRET=abc123\n');
		expect(entries).toEqual([
			{
				key: 'SESSION_SIGNING_SECRET',
				raw: 'export SESSION_SIGNING_SECRET=abc123',
				value: 'abc123',
			},
		]);
	});

	test('tolerates multiple spaces or a tab between export and the key', () => {
		expect(parseEnvironmentEntries('export   SPACED=a\n')[0]?.key).toBe('SPACED');
		expect(parseEnvironmentEntries('export\tTABBED=b\n')[0]?.key).toBe('TABBED');
	});

	test('does not strip a literal key named "export" with no following whitespace', () => {
		expect(parseEnvironmentEntries('export=literal\n')[0]?.key).toBe('export');
	});

	test('readEnvironmentEntriesFromFile finds an export-prefixed key by its real name', () => {
		writeSecretFileAtomic(environmentFile, 'export SESSION_SIGNING_SECRET=abc123\n');
		const entries = readEnvironmentEntriesFromFile(environmentFile);
		expect(entries['SESSION_SIGNING_SECRET']).toBe('abc123');
		expect(entries['export SESSION_SIGNING_SECRET']).toBeUndefined();
	});

	test('a rewrite that updates an export-prefixed key by its real name replaces it correctly', () => {
		writeSecretFileAtomic(environmentFile, 'export SESSION_SIGNING_SECRET=old\nOTHER=untouched\n');

		appendEnvironmentEntryToFile(environmentFile, 'SESSION_SIGNING_SECRET', 'new-value');

		const entries = readEnvironmentEntriesFromFile(environmentFile);
		expect(entries['SESSION_SIGNING_SECRET']).toBe('new-value');
		expect(entries['OTHER']).toBe('untouched');
		const rewrittenContent = readFileSync(environmentFile, 'utf-8');
		// Confirms the old `export ...` line was replaced, not left behind
		// alongside a second, newly appended `SESSION_SIGNING_SECRET=` line.
		expect(rewrittenContent).not.toContain('export SESSION_SIGNING_SECRET');
	});

	test("Bun's own .env loader agrees with what this parser reads for an export-prefixed entry", async () => {
		const dotEnvFile = join(directory, '.env');
		writeSecretFileAtomic(dotEnvFile, 'export FOO=bar\n');

		const parsed = readEnvironmentEntriesFromFile(dotEnvFile);

		const proc = Bun.spawn(['bun', '-e', 'console.log(JSON.stringify(process.env["FOO"]))'], {
			cwd: directory,
			stdout: 'pipe',
		});
		const output = (await new Response(proc.stdout).text()).trim();
		await proc.exited;
		expect(JSON.parse(output)).toBe(parsed['FOO']);
		expect(parsed['FOO']).toBe('bar');
	});
});
