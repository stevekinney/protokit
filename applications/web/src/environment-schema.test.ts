import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { webServerEnvironmentSchema } from '@web/environment-schema';

/**
 * SEC-002 regression: `z.coerce.boolean()` treats every non-empty string,
 * including the literal `"false"`, as `true` (`Boolean("false") === true`
 * in JavaScript). Every boolean flag in this schema gates security-relevant
 * behavior (conformance mode and tunnel-active both control whether
 * `mcp-routes.ts`'s localhost DNS-rebinding check is active, and
 * `scripts/develop.ts` writes `PROTOKIT_TUNNEL_ACTIVE=false` into the
 * spawned dev server's real environment on every non-`--tunnel` run), so a
 * mis-coerced `"false"` was a silent control bypass, not a cosmetic
 * annoyance. These fields must parse the literal strings `"true"`/`"false"`
 * to their real boolean meaning.
 */
const booleanFieldNames = [
	'MCP_ENABLE_UI_EXTENSION',
	'MCP_CONFORMANCE_MODE',
	'PROTOKIT_TUNNEL_ACTIVE',
] as const;

describe('webServerEnvironmentSchema boolean flags', () => {
	for (const fieldName of booleanFieldNames) {
		const schema = z.object({ [fieldName]: webServerEnvironmentSchema[fieldName] });

		it(`${fieldName}: the string "false" parses to false, not true`, () => {
			const parsed = schema.parse({ [fieldName]: 'false' });
			expect(parsed[fieldName]).toBe(false);
		});

		it(`${fieldName}: the string "true" parses to true`, () => {
			const parsed = schema.parse({ [fieldName]: 'true' });
			expect(parsed[fieldName]).toBe(true);
		});

		it(`${fieldName}: an unset value defaults to false`, () => {
			const parsed = schema.parse({});
			expect(parsed[fieldName]).toBe(false);
		});

		it(`${fieldName}: an unrecognized string fails validation instead of silently coercing`, () => {
			expect(() => schema.parse({ [fieldName]: 'yes' })).toThrow();
		});
	}
});

/**
 * Round 10 review finding: `METRICS_API_KEY` and `HEALTH_READINESS_API_KEY`
 * previously accepted a one-character value (`z.string().min(1)`) -- both
 * environment validation and production startup allowed a trivially
 * guessable bearer credential to gate an internet-facing operational
 * endpoint. Raised to a minimum comparable to `SESSION_SIGNING_SECRET`'s
 * entropy-oriented floor. Omission (unset) must remain the way to disable
 * each route entirely -- these fields stay `.optional()`.
 */
const operationalBearerKeyFieldNames = ['METRICS_API_KEY', 'HEALTH_READINESS_API_KEY'] as const;

describe('webServerEnvironmentSchema operational bearer keys', () => {
	for (const fieldName of operationalBearerKeyFieldNames) {
		const schema = z.object({ [fieldName]: webServerEnvironmentSchema[fieldName] });

		it(`${fieldName}: a one-character value is rejected`, () => {
			expect(() => schema.parse({ [fieldName]: 'x' })).toThrow();
		});

		it(`${fieldName}: a 31-character value is rejected`, () => {
			expect(() => schema.parse({ [fieldName]: 'a'.repeat(31) })).toThrow();
		});

		it(`${fieldName}: a 32-character value is accepted`, () => {
			const parsed = schema.parse({ [fieldName]: 'a'.repeat(32) });
			expect(parsed[fieldName]).toBe('a'.repeat(32));
		});

		it(`${fieldName}: omitting the value entirely is still accepted (disables the route)`, () => {
			const parsed = schema.parse({});
			expect(parsed[fieldName]).toBeUndefined();
		});
	}
});
