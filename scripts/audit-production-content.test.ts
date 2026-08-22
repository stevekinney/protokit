import { describe, expect, it, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	collectScanTargets,
	findProductionRegistryViolations,
	scanFileContentsForViolations,
} from './audit-production-content.js';

describe('scanFileContentsForViolations', () => {
	it('flags a placeholder domain in a config/documentation file', () => {
		const violations = scanFileContentsForViolations(
			'server.json',
			'{"homepage":"https://example.com"}',
		);
		expect(violations).toHaveLength(1);
		expect(violations[0]!.description).toContain('example.com');
	});

	it('does not flag "example.com" inside a .ts source comment (RFC 2606 documentation reference)', () => {
		const violations = scanFileContentsForViolations(
			'client-metadata-documents.ts',
			'// matching the CIMD draft: `https://example.com/client.json`',
		);
		expect(violations).toHaveLength(0);
	});

	it('does not flag "example.com" inside a test fixture\'s reserved test address', () => {
		const violations = scanFileContentsForViolations(
			'testing/context.ts',
			"email: 'test@example.com',",
		);
		expect(violations).toHaveLength(0);
	});

	it('flags an unfilled YOUR_DOMAIN placeholder', () => {
		const violations = scanFileContentsForViolations('a.json', '"url": "https://YOUR_DOMAIN/mcp"');
		expect(violations.some((v) => v.description.includes('YOUR_DOMAIN'))).toBe(true);
	});

	it('flags lorem ipsum text regardless of case', () => {
		const violations = scanFileContentsForViolations('a.md', 'Lorem Ipsum dolor sit amet');
		expect(violations.some((v) => v.description.includes('lorem ipsum'))).toBe(true);
	});

	it('flags a bare TODO marker', () => {
		const violations = scanFileContentsForViolations('a.ts', '// TODO: fix this later');
		expect(violations.some((v) => v.description.includes('TODO'))).toBe(true);
	});

	it('flags a bare FIXME marker', () => {
		const violations = scanFileContentsForViolations('a.ts', '// FIXME broken');
		expect(violations.some((v) => v.description.includes('FIXME'))).toBe(true);
	});

	it('flags the removed placeholder-instructions phrasing if it ever regresses', () => {
		const violations = scanFileContentsForViolations(
			'instructions.md',
			'Customize these instructions to describe your server.',
		);
		expect(violations.some((v) => v.description.includes('customize these instructions'))).toBe(
			true,
		);
	});

	it('finds nothing wrong with genuine, filled-in content', () => {
		const violations = scanFileContentsForViolations(
			'instructions.md',
			'This is a Model Context Protocol (MCP) server built from the Bun + React MCP Template.',
		);
		expect(violations).toHaveLength(0);
	});

	it('does not false-positive on a roadmap item reference like "S-14, owned by OBS-001"', () => {
		const violations = scanFileContentsForViolations(
			'summarize.ts',
			'// S-14 (owned by OBS-001, not touched here): no redaction policy.',
		);
		expect(violations).toHaveLength(0);
	});
});

describe('findProductionRegistryViolations', () => {
	it('flags conformance-fixture-named operations', () => {
		expect(findProductionRegistryViolations(['get_user_profile', 'test_image_content'])).toEqual([
			'test_image_content',
		]);
	});

	it('flags the synthetic audit-events tool by name', () => {
		expect(findProductionRegistryViolations(['get_user_profile', 'list_audit_events'])).toEqual([
			'list_audit_events',
		]);
	});

	it('is empty for a clean production registry', () => {
		expect(
			findProductionRegistryViolations(['get_user_profile', 'user_profile', 'summarize']),
		).toEqual([]);
	});
});

describe('collectScanTargets', () => {
	let scratchDirectory: string;

	afterEach(() => {
		if (scratchDirectory) rmSync(scratchDirectory, { recursive: true, force: true });
	});

	it('includes authored source files, static public assets, and a real server.json when present', () => {
		scratchDirectory = mkdtempSync(join(tmpdir(), 'audit-production-content-'));
		mkdirSync(join(scratchDirectory, 'applications/web/src/lib'), { recursive: true });
		mkdirSync(join(scratchDirectory, 'applications/web/public'), { recursive: true });
		mkdirSync(join(scratchDirectory, 'packages/mcp/src'), { recursive: true });
		writeFileSync(
			join(scratchDirectory, 'applications/web/src/lib/example.ts'),
			'export const value = 1;',
		);
		writeFileSync(join(scratchDirectory, 'applications/web/public/robots.txt'), 'User-agent: *');
		writeFileSync(join(scratchDirectory, 'packages/mcp/src/instructions.md'), 'Instructions.');
		writeFileSync(join(scratchDirectory, 'server.json'), '{}');

		const targets = collectScanTargets(scratchDirectory);

		expect(targets).toContain(join(scratchDirectory, 'applications/web/src/lib/example.ts'));
		expect(targets).toContain(join(scratchDirectory, 'applications/web/public/robots.txt'));
		expect(targets).toContain(join(scratchDirectory, 'packages/mcp/src/instructions.md'));
		expect(targets).toContain(join(scratchDirectory, 'server.json'));
	});

	it('never scans a .example file or a .test.ts file', () => {
		scratchDirectory = mkdtempSync(join(tmpdir(), 'audit-production-content-'));
		mkdirSync(join(scratchDirectory, 'packages/mcp/src'), { recursive: true });
		writeFileSync(
			join(scratchDirectory, 'server.json.example'),
			'{"homepage":"https://example.com"}',
		);
		writeFileSync(
			join(scratchDirectory, 'packages/mcp/src/list-audit-events.test.ts'),
			'expect(1).toBe(1);',
		);

		const targets = collectScanTargets(scratchDirectory);

		expect(targets).not.toContain(join(scratchDirectory, 'server.json.example'));
		expect(targets).not.toContain(
			join(scratchDirectory, 'packages/mcp/src/list-audit-events.test.ts'),
		);
	});

	it('skips binary assets and only scans server.json when nothing else exists', () => {
		scratchDirectory = mkdtempSync(join(tmpdir(), 'audit-production-content-'));
		mkdirSync(join(scratchDirectory, 'applications/web/public'), { recursive: true });
		writeFileSync(join(scratchDirectory, 'applications/web/public/favicon.png'), 'not-real-png');

		expect(collectScanTargets(scratchDirectory)).toEqual([]);
	});
});
