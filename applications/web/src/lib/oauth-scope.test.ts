import { describe, expect, it } from 'bun:test';

import { parseRequestedScope } from '@web/lib/oauth-scope';

/**
 * AUTHZ-001 review follow-up: an explicitly empty (or whitespace-only)
 * `scope` request parameter is not the same as an omitted one and must not
 * be granted the full default scope set — RFC 6749's `scope` ABNF requires
 * at least one scope-token, so a present-but-empty value is syntactically
 * invalid, not "no preference." Regression coverage for the distinction
 * `parseRequestedScope` now draws between `rawScope === null` (omitted) and
 * an explicit empty string.
 */
describe('parseRequestedScope', () => {
	it('grants the full default set when scope is omitted (null)', () => {
		const result = parseRequestedScope(null);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.scopes.length).toBeGreaterThan(0);
		}
	});

	it('rejects an explicitly empty scope parameter instead of defaulting to every scope', () => {
		const result = parseRequestedScope('');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe('invalid_scope');
		}
	});

	it('rejects a whitespace-only scope parameter the same way', () => {
		const result = parseRequestedScope('   ');
		expect(result.ok).toBe(false);
	});

	it('still accepts a real, recognized scope token', () => {
		const result = parseRequestedScope('profile:read');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.scopes).toEqual(['profile:read']);
		}
	});

	it('still rejects an unrecognized scope token', () => {
		const result = parseRequestedScope('admin:everything');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.unknownScopes).toEqual(['admin:everything']);
		}
	});
});
