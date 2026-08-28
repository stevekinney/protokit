import { describe, expect, it } from 'bun:test';
import { PACKAGE_VERSION } from './version.js';

/**
 * The drift guard that makes a checked-in version constant safe.
 *
 * `version.ts` deliberately duplicates `package.json`'s `version` as a
 * string literal so the advertised version survives bundling and reads no
 * file at runtime. The cost of that duplication is drift, and this test is
 * what pays it: bumping `package.json` for a release without updating the
 * constant turns red here rather than shipping a server that reports the
 * wrong version over the wire.
 *
 * Reading `package.json` from a *test* is fine — the constraint is on the
 * shipped module's import graph, not on the suite that checks it.
 */
describe('advertised package version', () => {
	it('matches the version in package.json', async () => {
		const packageMetadata = (await import('../package.json')) as unknown as {
			default: { version: string };
		};
		expect(PACKAGE_VERSION).toBe(packageMetadata.default.version);
	});

	it('is a non-empty string', () => {
		expect(typeof PACKAGE_VERSION).toBe('string');
		expect(PACKAGE_VERSION.length).toBeGreaterThan(0);
	});
});
