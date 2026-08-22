import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePublicFile } from '@web/resolve-public-file';

describe('resolvePublicFile', () => {
	it('returns a BunFile for an existing public file', async () => {
		const file = await resolvePublicFile('favicon.png');
		expect(file).not.toBeNull();
	});

	it('returns null for a nonexistent file', async () => {
		const file = await resolvePublicFile('nonexistent-file-that-does-not-exist.xyz');
		expect(file).toBeNull();
	});

	it('rejects literal ../ traversal above the public root', async () => {
		const file = await resolvePublicFile('../../../../../../../../etc/passwd');
		expect(file).toBeNull();
	});

	it('rejects a leading-slash path that would reset resolution to the filesystem root', async () => {
		const file = await resolvePublicFile('/etc/passwd');
		expect(file).toBeNull();
	});

	it('rejects percent-encoded dot-segment traversal', async () => {
		const file = await resolvePublicFile('%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd');
		expect(file).toBeNull();
	});

	it('rejects double-encoded dot-segment traversal', async () => {
		const file = await resolvePublicFile('%252e%252e/%252e%252e/etc/passwd');
		expect(file).toBeNull();
	});

	it('rejects backslash-separated traversal', async () => {
		const file = await resolvePublicFile('..\\..\\..\\..\\etc\\passwd');
		expect(file).toBeNull();
	});

	it('rejects a NUL byte in the path', async () => {
		const file = await resolvePublicFile('favicon.png\0.txt');
		expect(file).toBeNull();
	});

	it('rejects a mixed traversal that still nets outside the root', async () => {
		const file = await resolvePublicFile('assets/../../../../../../etc/passwd');
		expect(file).toBeNull();
	});

	describe('symlink containment', () => {
		const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));
		const outsideDirectory = join(tmpdir(), `resolve-public-file-outside-${process.pid}`);
		const outsideSecretPath = join(outsideDirectory, 'secret.txt');
		// The fixture name must be unique per process. `publicDirectory` is the
		// repository's real `public/` directory, shared by every concurrent run,
		// so a fixed name means two suites racing here either collide on
		// `symlinkSync` (EEXIST) or have one run's `afterAll` delete the other's
		// symlink mid-assertion. That surfaced as an intermittent failure that
		// looked like database contention and was very nearly dismissed as such.
		const symlinkName = `escape-symlink-test-${process.pid}.txt`;
		const symlinkPath = join(publicDirectory, symlinkName);

		beforeAll(() => {
			mkdirSync(outsideDirectory, { recursive: true });
			writeFileSync(outsideSecretPath, 'top secret, outside the public root');
			symlinkSync(outsideSecretPath, symlinkPath);
		});

		afterAll(() => {
			rmSync(symlinkPath, { force: true });
			rmSync(outsideDirectory, { recursive: true, force: true });
		});

		it('rejects a symlink inside the public root that points outside it', async () => {
			const file = await resolvePublicFile(symlinkName);
			expect(file).toBeNull();
		});
	});
});
