import { describe, expect, it, mock } from 'bun:test';

/**
 * Isolates the `realpathOrSelf` catch branch in `resolve-public-file.ts`:
 * `realpath` throwing (e.g. the file vanishing between the `exists()` check
 * and the realpath call) must fall back to the candidate path rather than
 * propagate. Mocking `node:fs/promises` to always throw exercises that
 * branch deterministically without racing a real filesystem deletion. This
 * lives in its own file (the suite runs with `--isolate`, so each test file
 * gets its own process) so the module-level mock can't affect
 * `resolve-public-file.test.ts`'s real symlink-containment assertions.
 */
mock.module('node:fs/promises', () => ({
	realpath: async () => {
		throw new Error('simulated realpath failure');
	},
}));

const { resolvePublicFile } = await import('@web/resolve-public-file');

describe('resolvePublicFile realpath failure fallback', () => {
	it('still resolves an existing public file when realpath throws', async () => {
		// favicon.png exists under public/; with realpath mocked to always
		// throw, realpathOrSelf falls back to the candidate path itself, and
		// since that candidate is already within the (non-realpathed) root,
		// containment still holds and the file is returned.
		const file = await resolvePublicFile('favicon.png');
		expect(file).not.toBeNull();
	});
});
