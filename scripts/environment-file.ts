/**
 * A real environment-file serializer/parser, parameterized over a file path rather than a
 * fixed singleton, so both `scripts/utilities.ts` (which always targets the root `.env.local`)
 * and tests (which target scratch files) go through the identical read/write/encode/decode
 * logic. SECRETS-001 (S-12): the previous implementation concatenated `${key}=${value}\n`
 * directly, which let a value containing a newline inject an unrelated `KEY=` line into the
 * file, and used `content.includes(\`${key}=\`)` to detect an existing key, which is a
 * substring check that can match a *different*, longer key (e.g. looking for `TOKEN` matches
 * inside an existing `REFRESH_TOKEN=` line).
 */
import { writeFileSync, readFileSync, existsSync, lstatSync, renameSync, chmodSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

export const SECRET_FILE_MODE = 0o600;

export function encodeEnvironmentValue(value: string): string {
	const needsQuoting = /["\\\n\r#]/.test(value) || value !== value.trim() || value === '';
	if (!needsQuoting) return value;

	const escaped = value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n');
	return `"${escaped}"`;
}

export function decodeEnvironmentValue(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
		const inner = trimmed.slice(1, -1);
		let result = '';
		for (let index = 0; index < inner.length; index++) {
			const char = inner[index];
			if (char === '\\' && index + 1 < inner.length) {
				const next = inner[index + 1];
				if (next === 'n') {
					result += '\n';
					index++;
					continue;
				}
				if (next === 'r') {
					result += '\r';
					index++;
					continue;
				}
				if (next === '"' || next === '\\') {
					result += next;
					index++;
					continue;
				}
			}
			result += char;
		}
		return result;
	}

	// Round 10 review finding: a single-quoted value (`GOOGLE_CLIENT_SECRET='abc#def'`)
	// fell all the way through to the unquoted-comment branch below, which
	// treated the `#` as a comment marker and truncated the value to `'abc`
	// -- corrupting it on the very next rewrite. Confirmed directly against
	// Bun's own `.env` loader (the same subprocess comparison the inline-comment
	// fix above already uses): Bun honors single quotes as a second quoting
	// style, entirely literal -- no backslash escaping, and a `#` inside the
	// quotes is never a comment, exactly like the double-quoted case above.
	// Bun's own parser does not support an escaped `'` inside single quotes
	// either, so matching to the very next `'` is the same construction Bun
	// itself uses, not an approximation of it.
	if (trimmed.startsWith("'") && trimmed.length >= 2) {
		const closingIndex = trimmed.indexOf("'", 1);
		if (closingIndex !== -1) {
			return trimmed.slice(1, closingIndex);
		}
	}

	// P2 review finding: an unquoted value like `PORT=3000 # local` was
	// previously returned verbatim as `3000 # local` -- the comment became
	// part of the runtime value, and re-serializing this entry then quoted
	// it (`PORT="3000 # local"`), permanently baking the comment text into
	// the value on the very first rewrite. Dotenv-style parsers treat an
	// unquoted `#` as starting a comment that runs to end of line,
	// regardless of whether it's preceded by whitespace -- confirmed
	// directly against Bun's own `.env` loader, which this repository's
	// runtime already uses to populate `process.env` from `.env.local`:
	// `A=value#nocomment` -> `"value"`, `PORT=3000 # local` -> `"3000"`,
	// `D=#leadinghash` -> `""`. Only a *quoted* value (handled above) may
	// contain a literal `#`. No escape sequence lets an unquoted value
	// contain a literal `#` either, matching that same observed behavior
	// (`val\#ue` truncates at `#`, the same as an unescaped one) -- a
	// value that needs a literal `#` must be quoted, which
	// `encodeEnvironmentValue` already does automatically on the next
	// write.
	const commentIndex = trimmed.indexOf('#');
	const withoutComment = commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex);
	return withoutComment.trimEnd();
}

export interface ParsedEnvironmentEntry {
	/** `undefined` for a comment or blank line, kept verbatim in `raw` to preserve formatting. */
	key: string | undefined;
	raw: string;
	value?: string;
}

export function parseEnvironmentEntries(content: string): ParsedEnvironmentEntry[] {
	const lines = content.replace(/\r\n?/g, '\n').split('\n');
	if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

	return lines.map((rawLine) => {
		const line = rawLine.trim();
		if (!line || line.startsWith('#') || !line.includes('=')) {
			return { key: undefined, raw: rawLine };
		}
		const separatorIndex = line.indexOf('=');
		const key = line.slice(0, separatorIndex).trim();
		const rawValue = line.slice(separatorIndex + 1);
		if (!key) return { key: undefined, raw: rawLine };
		return { key, raw: rawLine, value: decodeEnvironmentValue(rawValue) };
	});
}

export function serializeEnvironmentEntries(entries: ParsedEnvironmentEntry[]): string {
	const lines = entries.map((entry) =>
		entry.key === undefined
			? entry.raw
			: `${entry.key}=${encodeEnvironmentValue(entry.value ?? '')}`,
	);
	return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

/**
 * Refuses to follow a symlink at the target path — writing through one would silently place
 * secret material wherever the link points, which is exactly the kind of hazard a poisoned
 * `.env.local` (or a repository checked out onto shared/untrusted storage) could set up.
 */
function assertNotSymlink(path: string): void {
	if (!existsSync(path)) return;
	if (lstatSync(path).isSymbolicLink()) {
		throw new Error(`Refusing to write through symlink: ${path}`);
	}
}

/**
 * Writes atomically (temp file in the same directory, then rename) with mode `0600`, so a
 * crash mid-write never leaves a partially written secret file and the file is never briefly
 * group- or world-readable. Repairs the mode of an existing file on every write, even when its
 * content is unchanged, so a file created with looser permissions by an older version of this
 * tooling — or by hand — is corrected the next time setup touches it.
 */
export function writeSecretFileAtomic(path: string, content: string): void {
	assertNotSymlink(path);
	const directory = dirname(path);
	const temporaryPath = join(directory, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
	assertNotSymlink(temporaryPath);
	writeFileSync(temporaryPath, content, { mode: SECRET_FILE_MODE });
	chmodSync(temporaryPath, SECRET_FILE_MODE);
	renameSync(temporaryPath, path);
	chmodSync(path, SECRET_FILE_MODE);
}

export function readEnvironmentEntriesFromFile(path: string): Record<string, string> {
	if (!existsSync(path)) return {};
	const content = readFileSync(path, 'utf-8');
	const result: Record<string, string> = {};
	for (const entry of parseEnvironmentEntries(content)) {
		if (entry.key !== undefined) result[entry.key] = entry.value ?? '';
	}
	return result;
}

/**
 * Round 10 review finding: `rotate-secret.ts` used to set two related keys
 * (`SESSION_SIGNING_SECRET` and `SESSION_SIGNING_SECRET_PREVIOUS`) via two
 * separate calls to the single-key form below -- two separate reads and two
 * separate `writeSecretFileAtomic` calls. Each individual write is atomic,
 * but the *pair* was not: an interruption (process kill, disk full) between
 * the two writes left `.env.local` with the new current secret and no
 * previous one, destroying the overlap window rotation exists to provide.
 * This reads the file once, applies every entry in memory, and persists all
 * of them with one `writeSecretFileAtomic` call, so a set of related keys
 * either all land together or none do.
 */
export function appendEnvironmentEntriesToFile(
	path: string,
	values: ReadonlyArray<{ key: string; value: string }>,
): void {
	const existingContent = existsSync(path)
		? (assertNotSymlink(path), readFileSync(path, 'utf-8'))
		: '';

	const entries = parseEnvironmentEntries(existingContent);
	for (const { key, value } of values) {
		const existingIndex = entries.findIndex((entry) => entry.key === key);
		if (existingIndex >= 0) {
			entries[existingIndex] = { key, raw: '', value };
		} else {
			entries.push({ key, raw: '', value });
		}
	}

	writeSecretFileAtomic(path, serializeEnvironmentEntries(entries));
}

export function appendEnvironmentEntryToFile(path: string, key: string, value: string): void {
	appendEnvironmentEntriesToFile(path, [{ key, value }]);
}

export function removeEnvironmentEntryFromFile(path: string, key: string): void {
	if (!existsSync(path)) return;
	assertNotSymlink(path);

	const content = readFileSync(path, 'utf-8');
	const entries = parseEnvironmentEntries(content).filter((entry) => entry.key !== key);
	writeSecretFileAtomic(path, serializeEnvironmentEntries(entries));
}
