import { describe, expect, it } from 'bun:test';
import {
	extractReferencedFilePaths,
	extractReferencedScriptNames,
	findMissingReferencedFiles,
	findMissingReferencedScripts,
	scanDocumentationContentsForViolations,
} from './audit-documentation.js';

describe('scanDocumentationContentsForViolations', () => {
	it('flags a current-state claim that the removed v1 SDK package is used', () => {
		const violations = scanDocumentationContentsForViolations(
			'README.md',
			'This server imports @modelcontextprotocol/sdk for its transport.',
		);
		expect(violations.some((v) => v.description.includes('v1 MCP SDK'))).toBe(true);
	});

	it('does NOT flag a doc explicitly saying the v1 SDK package is not used', () => {
		const violations = scanDocumentationContentsForViolations(
			'README.md',
			'On the v2 packages, not the v1 @modelcontextprotocol/sdk package.',
		);
		expect(violations.some((v) => v.description.includes('v1 MCP SDK'))).toBe(false);
	});

	it('flags client_credentials described as supported', () => {
		const violations = scanDocumentationContentsForViolations(
			'README.md',
			'Machine clients authenticate with client_credentials.',
		);
		expect(violations.some((v) => v.description.includes('client_credentials'))).toBe(true);
	});

	it('does NOT flag a doc explicitly saying client_credentials was removed', () => {
		const violations = scanDocumentationContentsForViolations(
			'PROGRESS.local.md',
			'client_credentials was removed by SEC-001.',
		);
		expect(violations.some((v) => v.description.includes('client_credentials'))).toBe(false);
	});

	it('flags SKIP_ENV_VALIDATION documented as a working usage pattern', () => {
		const violations = scanDocumentationContentsForViolations(
			'SKILL.md',
			'Use SKIP_ENV_VALIDATION=true for CI.',
		);
		expect(violations.some((v) => v.description.includes('SKIP_ENV_VALIDATION'))).toBe(true);
	});

	it('does NOT flag a doc saying SKIP_ENV_VALIDATION does not exist', () => {
		const violations = scanDocumentationContentsForViolations(
			'SKILL.md',
			'SKIP_ENV_VALIDATION does not exist in this codebase under any name.',
		);
		expect(violations.some((v) => v.description.includes('SKIP_ENV_VALIDATION'))).toBe(false);
	});

	it('flags mcp-session-id described as a current header', () => {
		const violations = scanDocumentationContentsForViolations(
			'ARCHITECTURE.md',
			'Subsequent requests include the mcp-session-id header.',
		);
		expect(violations.some((v) => v.description.includes('session-affinity'))).toBe(true);
	});

	it('does NOT flag a doc saying there is no mcp-session-id header anymore', () => {
		const violations = scanDocumentationContentsForViolations(
			'ARCHITECTURE.md',
			'This server no longer issues an mcp-session-id header.',
		);
		expect(violations.some((v) => v.description.includes('session-affinity'))).toBe(false);
	});

	it('flags a placeholder domain in a .md file', () => {
		const violations = scanDocumentationContentsForViolations(
			'README.md',
			'Deploy at https://example.com/mcp.',
		);
		expect(violations.some((v) => v.description.includes('placeholder domain'))).toBe(true);
	});

	it('does NOT flag the RFC 2606 reserved test@example.com address', () => {
		const violations = scanDocumentationContentsForViolations(
			'CLAUDE.md',
			'test defaults: test@example.com, Test User',
		);
		expect(violations.some((v) => v.description.includes('placeholder domain'))).toBe(false);
	});

	it('does not apply the .md-only example.com check to a non-.md file', () => {
		const violations = scanDocumentationContentsForViolations(
			'notes.ts',
			'// see https://example.com/spec',
		);
		expect(violations.some((v) => v.description.includes('placeholder domain'))).toBe(false);
	});

	it('flags lorem ipsum regardless of file extension', () => {
		const violations = scanDocumentationContentsForViolations('CLAUDE.md', 'Lorem ipsum dolor');
		expect(violations.some((v) => v.description.includes('lorem ipsum'))).toBe(true);
	});

	it('returns no violations for clean, accurate documentation', () => {
		const violations = scanDocumentationContentsForViolations(
			'README.md',
			'This server uses @modelcontextprotocol/core, /server, and /client at 2.0.0.',
		);
		expect(violations).toHaveLength(0);
	});
});

describe('extractReferencedFilePaths / findMissingReferencedFiles', () => {
	it('extracts a repo-root-relative path from backticks', () => {
		const paths = extractReferencedFilePaths(
			'See `applications/web/src/lib/mcp-handler.ts` for the transport.',
		);
		expect(paths).toEqual(['applications/web/src/lib/mcp-handler.ts']);
	});

	it('ignores a package-relative shorthand path (no repo-root prefix)', () => {
		const paths = extractReferencedFilePaths('See `src/env.ts` for the schema.');
		expect(paths).toEqual([]);
	});

	it('ignores an illustrative placeholder filename', () => {
		const paths = extractReferencedFilePaths(
			'Create `packages/mcp/src/tools/my-tool-name.ts` (kebab-case filename).',
		);
		expect(paths).toEqual([]);
	});

	it('ignores a templated path containing curly braces', () => {
		const paths = extractReferencedFilePaths(
			'Create `packages/mcp-apps/src/applications/{app-name}/{app-name}.tsx`.',
		);
		expect(paths).toEqual([]);
	});

	it('ignores an npm package specifier', () => {
		const paths = extractReferencedFilePaths('Import from `@modelcontextprotocol/server`.');
		expect(paths).toEqual([]);
	});

	it('finds a real file as present, not missing', () => {
		const missing = findMissingReferencedFiles(process.cwd(), ['package.json']);
		expect(missing).toEqual([]);
	});

	it('flags a genuinely nonexistent file as missing', () => {
		const missing = findMissingReferencedFiles(process.cwd(), [
			'applications/web/src/this-file-does-not-exist.ts',
		]);
		expect(missing).toEqual(['applications/web/src/this-file-does-not-exist.ts']);
	});
});

describe('extractReferencedScriptNames / findMissingReferencedScripts', () => {
	it('extracts a bun run script name', () => {
		const names = extractReferencedScriptNames('Run `bun run doctor` first.');
		expect(names).toEqual(['doctor']);
	});

	it('extracts a namespaced script name with colons', () => {
		const names = extractReferencedScriptNames('Run `bun run test:oauth:interop`.');
		expect(names).toEqual(['test:oauth:interop']);
	});

	it('reports no missing scripts when every named script exists', () => {
		const missing = findMissingReferencedScripts({ doctor: 'bun scripts/doctor.ts' }, ['doctor']);
		expect(missing).toEqual([]);
	});

	it('flags a script name that does not exist in package.json', () => {
		const missing = findMissingReferencedScripts({ doctor: 'bun scripts/doctor.ts' }, [
			'this-script-does-not-exist',
		]);
		expect(missing).toEqual(['this-script-does-not-exist']);
	});
});
