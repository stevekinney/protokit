import { describe, expect, it } from 'bun:test';
import {
	canonicalizeConfiguredOrigin,
	findInvalidConfiguredOrigins,
	splitConfiguredOrigins,
} from '@web/lib/mcp-allowed-origins';

describe('canonicalizeConfiguredOrigin', () => {
	it('canonicalizes a value with a trailing slash', () => {
		expect(canonicalizeConfiguredOrigin('https://claude.ai/')).toBe('https://claude.ai');
	});

	it('rejects a value carrying a path', () => {
		expect(canonicalizeConfiguredOrigin('https://claude.ai/callback')).toBeNull();
	});

	it('rejects a malformed URL', () => {
		expect(canonicalizeConfiguredOrigin('not a url')).toBeNull();
	});
});

describe('splitConfiguredOrigins', () => {
	it('trims whitespace and drops empty entries', () => {
		expect(splitConfiguredOrigins(' https://a.example, https://b.example ,,')).toEqual([
			'https://a.example',
			'https://b.example',
		]);
	});
});

/**
 * Round-16 review finding (P2, `applications/web/src/lib/mcp-origin-validation.ts:57`):
 * a malformed `MCP_ALLOWED_ORIGINS` entry used to be silently dropped by
 * `parseAllowedOrigins`, so a nonempty configured value could still turn
 * into an empty allow-list with no signal. `findInvalidConfiguredOrigins`
 * is what makes that operator-visible -- see `production-startup-requirements.test.ts`
 * and `doctor.test.ts` for the startup/doctor-level regression coverage
 * that consumes this function.
 */
describe('findInvalidConfiguredOrigins', () => {
	it('reports nothing when every entry canonicalizes', () => {
		expect(findInvalidConfiguredOrigins('https://claude.ai,http://localhost:3000')).toEqual([]);
	});

	it('reports a malformed entry that would otherwise silently vanish from the allow-list', () => {
		expect(findInvalidConfiguredOrigins('https://claude.ai/callback')).toEqual([
			'https://claude.ai/callback',
		]);
	});

	it('reports only the malformed entries out of a mixed list', () => {
		expect(findInvalidConfiguredOrigins('https://claude.ai,https://claude.ai/callback')).toEqual([
			'https://claude.ai/callback',
		]);
	});
});
