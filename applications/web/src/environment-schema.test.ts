import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { maxTimerSafeIntervalSeconds, webServerEnvironmentSchema } from '@web/environment-schema';

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

/**
 * Review finding (P1, `environment-schema.ts:155`): `server.ts` multiplies
 * `SCHEDULED_CLEANUP_INTERVAL_SECONDS` by 1000 before calling `setInterval`.
 * Node/Bun's timer delay overflows a 32-bit signed integer above
 * 2147483647ms and silently substitutes a 1ms interval (confirmed directly
 * against Bun -- see `environment-schema.ts`'s own doc comment) -- turning
 * a configured "run rarely" interval into a full production cleanup sweep
 * firing continuously. The schema must reject any value that would
 * overflow after that multiplication rather than accept it and let the
 * overflow happen silently at the timer.
 */
describe('webServerEnvironmentSchema SCHEDULED_CLEANUP_INTERVAL_SECONDS', () => {
	const schema = z.object({
		SCHEDULED_CLEANUP_INTERVAL_SECONDS:
			webServerEnvironmentSchema.SCHEDULED_CLEANUP_INTERVAL_SECONDS,
	});

	it('accepts the default one-hour interval when the value is omitted', () => {
		const parsed = schema.parse({});
		expect(parsed.SCHEDULED_CLEANUP_INTERVAL_SECONDS).toBe(3600);
	});

	it('accepts exactly the timer-safe maximum', () => {
		const parsed = schema.parse({
			SCHEDULED_CLEANUP_INTERVAL_SECONDS: String(maxTimerSafeIntervalSeconds),
		});
		expect(parsed.SCHEDULED_CLEANUP_INTERVAL_SECONDS).toBe(maxTimerSafeIntervalSeconds);
		// The concrete overflow this fix prevents: multiplying the accepted
		// maximum by 1000 (what server.ts does before calling setInterval)
		// must stay within the 32-bit signed integer setInterval actually
		// honors.
		expect(maxTimerSafeIntervalSeconds * 1000).toBeLessThanOrEqual(2147483647);
	});

	it('rejects a reasonable-looking 30-day interval that overflows the timer after *1000', () => {
		const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
		expect(thirtyDaysInSeconds).toBeGreaterThan(maxTimerSafeIntervalSeconds);
		expect(() =>
			schema.parse({ SCHEDULED_CLEANUP_INTERVAL_SECONDS: String(thirtyDaysInSeconds) }),
		).toThrow();
	});

	it('rejects one second past the timer-safe maximum', () => {
		expect(() =>
			schema.parse({
				SCHEDULED_CLEANUP_INTERVAL_SECONDS: String(maxTimerSafeIntervalSeconds + 1),
			}),
		).toThrow();
	});
});
