/**
 * Rejects control, bidirectional-override, and other confusable characters
 * in an OAuth client display name (SEC-005 / roadmap: "Bound and reject
 * control, bidirectional, confusable, or misleading client-name metadata").
 *
 * A client name is rendered directly on the consent screen next to "is
 * requesting access as <you>". Without this check a malicious client could
 * register a name containing bidirectional-override characters (to visually
 * reverse or splice text into something impersonating a trusted app) or
 * other C0/C1 control characters (to inject line breaks, hide characters,
 * or otherwise manipulate how the name renders) even though React JSX text
 * nodes already prevent HTML/script injection.
 *
 * Every disallowed character is matched by its exact \uXXXX code point,
 * never pasted as a literal invisible glyph, so the set stays reviewable
 * and cannot silently drift if this file is re-encoded.
 */

// C0 controls (U+0000-001F) and DEL/C1 controls (U+007F-009F). A display
// name has no legitimate use for a control character, including tab/newline.
// The control characters below are the entire point of this pattern,
// not an accidental inclusion.
// eslint-disable-next-line no-control-regex
const controlCharacterPattern = /[\u0000-\u001F\u007F-\u009F]/;

// Unicode bidirectional formatting characters: the standalone LRM/RLM marks
// (U+200E, U+200F), ALM (U+061C), LRE/RLE/PDF/LRO/RLO (U+202A-202E), and
// LRI/RLI/FSI/PDI (U+2066-2069). Any of these can visually reorder or
// splice surrounding text -- the class of attack behind "trojan source".
const bidiControlCharacterPattern = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

// Zero-width characters used to disguise or splice visually identical
// names: zero-width space/non-joiner/joiner (U+200B-200D) and the BOM /
// zero-width no-break space (U+FEFF).
const zeroWidthCharacterPattern = /[\u200B-\u200D\uFEFF]/;

export function isValidClientName(name: string): boolean {
	if (name.length === 0) {
		return false;
	}

	if (controlCharacterPattern.test(name)) {
		return false;
	}

	if (bidiControlCharacterPattern.test(name)) {
		return false;
	}

	if (zeroWidthCharacterPattern.test(name)) {
		return false;
	}

	return true;
}
