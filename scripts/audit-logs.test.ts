import { describe, expect, it } from 'bun:test';
import { scanFileForLogMessageViolations, collectScanTargets } from './audit-logs.js';

describe('scanFileForLogMessageViolations', () => {
	it('flags an access token interpolated directly into a log message', () => {
		const violations = scanFileForLogMessageViolations(
			'example.ts',
			'logger.info(`Issued token ${accessToken} to client`);',
		);
		expect(violations).toHaveLength(1);
		expect(violations[0]!.line).toBe(1);
	});

	it('flags a client secret interpolated into a warn message', () => {
		const violations = scanFileForLogMessageViolations(
			'example.ts',
			'logger.warn(`Authentication failed for secret ${clientSecret}`);',
		);
		expect(violations).toHaveLength(1);
	});

	it('flags a database URL interpolated into an error message', () => {
		const violations = scanFileForLogMessageViolations(
			'example.ts',
			'logger.error(`Could not connect: ${databaseUrl}`);',
		);
		expect(violations).toHaveLength(1);
	});

	it('does not flag a structured logging call passing an object argument', () => {
		const violations = scanFileForLogMessageViolations(
			'example.ts',
			"logger.info({ requestId, userId }, 'Request handled');",
		);
		expect(violations).toHaveLength(0);
	});

	it('does not flag a template message referencing non-sensitive identifiers', () => {
		const violations = scanFileForLogMessageViolations(
			'example.ts',
			'logger.info(`Handled request ${requestId} for user ${userId}`);',
		);
		expect(violations).toHaveLength(0);
	});

	it('does not flag sessionToken (an opaque lookup key, not the cookie value)', () => {
		const violations = scanFileForLogMessageViolations(
			'example.ts',
			'logger.info(`Rotated ${sessionToken}`);',
		);
		expect(violations).toHaveLength(0);
	});

	it('reports the correct line number for a violation later in the file', () => {
		const violations = scanFileForLogMessageViolations(
			'example.ts',
			[
				'const a = 1;',
				'const b = 2;',
				'logger.warn(`Refresh token reused: ${refreshToken}`);',
			].join('\n'),
		);
		expect(violations).toHaveLength(1);
		expect(violations[0]!.line).toBe(3);
	});
});

describe('collectScanTargets', () => {
	it("finds this repository's real source files", () => {
		const targets = collectScanTargets(process.cwd());
		expect(targets.length).toBeGreaterThan(0);
		expect(targets.every((target) => !/\.test\.tsx?$/.test(target))).toBe(true);
	});
});
