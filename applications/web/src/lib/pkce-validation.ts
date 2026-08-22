import {
	pkceCodeChallengeLength,
	pkceMaxCodeVerifierLength,
	pkceMinCodeVerifierLength,
} from '@web/lib/request-limits';

/** RFC 7636 §4.1: `code-verifier = 43*128unreserved`, `unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~"`. */
const pkceCodeVerifierPattern = new RegExp(
	`^[A-Za-z0-9\\-._~]{${pkceMinCodeVerifierLength},${pkceMaxCodeVerifierLength}}$`,
);

/** Base64url alphabet (RFC 4648 §5), unpadded, at the fixed length a SHA-256 digest produces. */
const pkceCodeChallengePattern = new RegExp(`^[A-Za-z0-9_-]{${pkceCodeChallengeLength}}$`);

/** Validates length and character set before the value is ever hashed or compared. */
export function isValidPkceCodeVerifier(value: string): boolean {
	return pkceCodeVerifierPattern.test(value);
}

/** Validates the S256 `code_challenge` syntax the same way, before it is stored or compared. */
export function isValidPkceCodeChallenge(value: string): boolean {
	return pkceCodeChallengePattern.test(value);
}
