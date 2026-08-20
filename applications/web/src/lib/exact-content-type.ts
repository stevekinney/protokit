/**
 * Strict content-type matching: exactly one recognized media type, ignoring
 * a trailing `charset`/other parameter but rejecting everything else,
 * including a header with multiple values (the Fetch `Headers` object joins
 * repeated header lines with `, `, which will never equal a bare media
 * type and so is rejected here as a side effect — ambiguous encodings are
 * exactly what this guards against).
 */
export function isExactContentType(headerValue: string | null, expectedMediaType: string): boolean {
	if (headerValue === null) return false;
	const mediaType = headerValue.split(';')[0]?.trim().toLowerCase();
	return mediaType === expectedMediaType;
}
