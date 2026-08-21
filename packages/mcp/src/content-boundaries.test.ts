import { describe, expect, it } from 'bun:test';
import instructions from './instructions.md' with { type: 'text' };

/**
 * CONTENT-001: guards against the placeholder-instructions regression this
 * item fixed ("Customize these instructions to describe your server's
 * purpose...") and enforces the roadmap's own acceptance criterion that the
 * first 512 characters must be meaningful without later context — Codex
 * clients only surface that much of a server's instructions in some
 * contexts, so the opening has to stand on its own.
 */

const firstFiveHundredTwelveCharacters = instructions.slice(0, 512);

describe('server instructions', () => {
	it('never contains the removed generic placeholder phrasing', () => {
		expect(instructions.toLowerCase()).not.toContain('customize these instructions');
	});

	it('the first 512 characters describe the server purpose, capability families, and authentication', () => {
		const opening = firstFiveHundredTwelveCharacters.toLowerCase();
		expect(opening).toContain('model context protocol');
		expect(
			opening.includes('tool') || opening.includes('resource') || opening.includes('prompt'),
		).toBe(true);
		expect(opening).toContain('oauth');
		expect(opening).toContain('own account');
	});

	it('the opening paragraph is a complete, self-contained unit that fits inside the 512-character budget', () => {
		const openingParagraph = instructions.split('\n\n')[0]!;
		expect(openingParagraph.length).toBeLessThanOrEqual(512);
		// Ends on a real sentence boundary, not truncated mid-word — a client
		// that only surfaces the first 512 characters still gets a
		// grammatically complete opening.
		expect(openingParagraph.trimEnd().endsWith('.')).toBe(true);
	});

	it('mentions every tool, resource, and prompt this server actually registers by name', () => {
		expect(instructions).toContain('get_user_profile');
		expect(instructions).toContain('user_profile');
		expect(instructions).toContain('summarize');
	});

	it('never mentions the conformance-only synthetic audit-events fixture', () => {
		expect(instructions).not.toContain('list_audit_events');
	});
});
