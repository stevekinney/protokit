/**
 * The version this server advertises over the wire.
 *
 * A checked-in constant rather than a read of `package.json`, for two
 * reasons that pull in the same direction:
 *
 * - A plain string literal survives every bundler by construction. The
 *   alternative a consumer would otherwise inherit —
 *   `createRequire(import.meta.url)('../package.json')` — resolves
 *   relative to the *generated bundle* rather than to this source file,
 *   so a host that bundles this package advertises the host's version, or
 *   fails outright for a nested output chunk.
 * - It reads nothing at runtime, so it cannot be the reason importing this
 *   package touches the filesystem.
 *
 * The obvious cost of a duplicated literal is drift, and that is exactly
 * what `version.test.ts` removes: it asserts this constant equals
 * `package.json`'s `version`, so bumping one without the other is a red
 * test rather than a wrong number on the wire. That test is the only
 * thing making this approach safe — do not delete it to silence a release
 * bump; update this constant instead.
 */
export const PACKAGE_VERSION = '0.0.0';
