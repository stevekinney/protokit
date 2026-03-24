import { describe, expect, it } from 'bun:test';
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
});
