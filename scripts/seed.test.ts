import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { deliverSeedClientSecret, ALREADY_CREATED_MARKER } from './seed.ts';
import { SECRET_FILE_MODE } from './utilities.ts';

describe('deliverSeedClientSecret', () => {
	let directory: string;

	afterEach(() => {
		if (directory) rmSync(directory, { recursive: true, force: true });
	});

	test('writes a freshly created secret to a 0600 file instead of returning it', () => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-seed-test-'));
		const secretFilePath = join(directory, '.env.local.seed-client-secret');
		const secret = 'a-real-generated-secret-value';

		const message = deliverSeedClientSecret(secretFilePath, secret);

		expect(message).not.toContain(secret);
		expect(existsSync(secretFilePath)).toBe(true);
		expect(readFileSync(secretFilePath, 'utf-8')).toBe(`${secret}\n`);
		expect(statSync(secretFilePath).mode & 0o777).toBe(SECRET_FILE_MODE);
	});

	test('never writes a file for the already-created marker, and the marker never leaks a real secret', () => {
		directory = mkdtempSync(join(tmpdir(), 'protokit-seed-test-'));
		const secretFilePath = join(directory, '.env.local.seed-client-secret');

		const message = deliverSeedClientSecret(secretFilePath, ALREADY_CREATED_MARKER);

		expect(message).toContain(ALREADY_CREATED_MARKER);
		expect(existsSync(secretFilePath)).toBe(false);
	});
});
