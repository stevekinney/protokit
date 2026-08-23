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
 *
 * A P2 review finding: none of the checks above catch a single-script-per-
 * character but mixed-script *homoglyph* name -- `PаyPal` (Cyrillic
 * а, U+0430) contains no control, bidi, or zero-width character and passed
 * every check above, rendering on the consent screen as a visually perfect
 * impersonation of a real relying party's identity. `containsMixedLatinConfusables`
 * below adds one more, deliberately narrow, check for that specific class,
 * rather than a full Unicode confusable-skeleton comparison (UTS #39
 * §4, "Confusable Detection"): that requires a maintained per-character
 * confusable mapping table covering the entire Unicode repertoire (the
 * kind of dependency this branch's own history warns against pulling in
 * lightly -- see `SUPPLY-001`'s notes on a pinned CLI dragging nine
 * advisories into the lockfile) and is also the more false-positive-prone
 * approach: a full skeleton comparison needs a *reference* name to compare
 * against (there is no fixed catalog of "protected" brand names here to
 * compare a new registration to), so it would either require maintaining
 * such a catalog or flagging *any* character that has *any* confusable in
 * *any* other script -- which would reject enormous numbers of entirely
 * legitimate single-script non-Latin names (the existing "ordinary
 * non-Latin text" test below covers exactly the kind of name that
 * approach would put at risk).
 *
 * Mixed-script detection is the standard, cheap, low-false-positive first
 * line of defense recommended by the same UTS #39 (its "Single Script" /
 * "Highly Restrictive" identifier profiles, the basis for how browsers and
 * domain registrars flag homograph IDN spoofing) and directly closes the
 * review's exact reported case: it rejects a name only when it mixes
 * Latin-script letters with Cyrillic or Greek ones in the *same* name --
 * the two scripts with by far the largest visually-identical overlap with
 * Latin (Cyrillic а/е/о/р/с/у/х/А/В/Е/К/М/Н/О/Р/С/Т/Х and Greek
 * Α/Β/Ε/Ζ/Η/Ι/Κ/Μ/Ν/Ο/Ρ/Τ/Υ/Χ are pixel-identical to their Latin
 * look-alikes at typical rendering, and are the two scripts every major
 * IDN-homograph advisory names as the primary Latin-confusable risk) --
 * while leaving every purely single-script name untouched, including a
 * name written entirely in Cyrillic, entirely in Greek, or (as the
 * existing test below already requires) mixed Han/Hiragana/Katakana
 * Japanese text, none of which this check ever inspects.
 *
 * Known, deliberate residual gap, stated rather than hidden: a name
 * spelled *entirely* in Cyrillic or Greek look-alikes with zero actual
 * Latin characters (e.g. a name built only from the Cyrillic letters that
 * happen to have Latin twins) would still pass -- it is a real, harder,
 * and rarer attack (most brand names need at least one letter, commonly
 * a lowercase "l", "i", or "d", that Cyrillic/Greek has no clean visual
 * match for) than the mixed-script case this fix targets, and closing it
 * fully needs the same full confusable-skeleton comparison this fix
 * deliberately declines to add for the reasons above.
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

// Unicode `Script` property escapes (native `RegExp` support, no external
// confusable-mapping dependency) -- see the module comment above for why
// exactly Latin, Cyrillic, and Greek, and not "any two different scripts".
const latinScriptCharacterPattern = /\p{Script=Latin}/u;
const confusableWithLatinScriptCharacterPattern = /\p{Script=Cyrillic}|\p{Script=Greek}/u;

function containsMixedLatinConfusables(name: string): boolean {
	return (
		latinScriptCharacterPattern.test(name) && confusableWithLatinScriptCharacterPattern.test(name)
	);
}

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

	if (containsMixedLatinConfusables(name)) {
		return false;
	}

	return true;
}
