import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { mcpServerEnvironmentSchema } from './environment-schema.js';

describe('mcpServerEnvironmentSchema MCP_SERVER_NAME', () => {
	const schema = z.object({ MCP_SERVER_NAME: mcpServerEnvironmentSchema.MCP_SERVER_NAME });

	it('is required and cannot silently regain a default', () => {
		expect(() => schema.parse({})).toThrow(/MCP_SERVER_NAME/);
	});

	it('accepts an explicit non-empty server name', () => {
		expect(schema.parse({ MCP_SERVER_NAME: 'protokit-mcp-server' }).MCP_SERVER_NAME).toBe(
			'protokit-mcp-server',
		);
	});
});

/**
 * SEC-002 regression: see `applications/web/src/environment-schema.test.ts`
 * for the full rationale. `z.coerce.boolean()` treats the string `"false"`
 * as `true`; `MCP_CONFORMANCE_MODE` must not.
 */
describe('mcpServerEnvironmentSchema MCP_CONFORMANCE_MODE', () => {
	const schema = z.object({
		MCP_CONFORMANCE_MODE: mcpServerEnvironmentSchema.MCP_CONFORMANCE_MODE,
	});

	it('the string "false" parses to false, not true', () => {
		expect(schema.parse({ MCP_CONFORMANCE_MODE: 'false' }).MCP_CONFORMANCE_MODE).toBe(false);
	});

	it('the string "true" parses to true', () => {
		expect(schema.parse({ MCP_CONFORMANCE_MODE: 'true' }).MCP_CONFORMANCE_MODE).toBe(true);
	});

	it('an unset value defaults to false', () => {
		expect(schema.parse({}).MCP_CONFORMANCE_MODE).toBe(false);
	});

	it('an unrecognized string fails validation instead of silently coercing', () => {
		expect(() => schema.parse({ MCP_CONFORMANCE_MODE: 'yes' })).toThrow();
	});
});

/**
 * OBS-001: schema-level validation for the diagnostic-content-logging
 * escape hatch. `env.ts`'s own test file (`env.test.ts`) covers the
 * separate, imperative "refused outright in production" check — a
 * `.refine()` here cannot see `NODE_ENV`, since this schema shape has no
 * cross-field checks by design (see the comment on the field itself).
 */
describe('mcpServerEnvironmentSchema LOG_CONTENT_DIAGNOSTICS_UNTIL', () => {
	const schema = z.object({
		LOG_CONTENT_DIAGNOSTICS_UNTIL: mcpServerEnvironmentSchema.LOG_CONTENT_DIAGNOSTICS_UNTIL,
	});

	it('is undefined when unset', () => {
		expect(schema.parse({}).LOG_CONTENT_DIAGNOSTICS_UNTIL).toBeUndefined();
	});

	it('accepts a valid ISO 8601 datetime with an offset', () => {
		expect(
			schema.parse({ LOG_CONTENT_DIAGNOSTICS_UNTIL: '2099-01-01T00:00:00Z' })
				.LOG_CONTENT_DIAGNOSTICS_UNTIL,
		).toBe('2099-01-01T00:00:00Z');
	});

	it('rejects a non-datetime string instead of silently ignoring it', () => {
		expect(() => schema.parse({ LOG_CONTENT_DIAGNOSTICS_UNTIL: 'not-a-date' })).toThrow();
	});

	it('rejects a bare date with no time component', () => {
		expect(() => schema.parse({ LOG_CONTENT_DIAGNOSTICS_UNTIL: '2099-01-01' })).toThrow();
	});
});
