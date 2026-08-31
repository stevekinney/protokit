import { describe, expect, test } from 'bun:test';
import { renameTemplateContent, TARGET_FILENAMES } from './rename.ts';

describe('renameTemplateContent', () => {
	test('renames package scopes and both historical server-name placeholders', () => {
		expect(
			renameTemplateContent(
				'@template/web template-mcp-server protokit-mcp-server',
				'@acme/reviewer',
			),
		).toBe('@acme/web acme-reviewer-mcp-server acme-reviewer-mcp-server');
	});

	test('includes the required environment example in the rename operation', () => {
		expect(TARGET_FILENAMES).toContain('.env.example');
	});
});
