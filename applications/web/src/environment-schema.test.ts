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
