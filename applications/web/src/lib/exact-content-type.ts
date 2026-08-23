/**
 * Whether `value` contains a comma outside any double-quoted parameter
 * value (e.g. a `boundary="a,b"` parameter is allowed to contain a comma;
 * a second, comma-separated media type is not). A repeated header joined
 * by the Fetch `Headers` object, or a literal duplicate header line, both
 * surface this way — e.g. `application/json; charset=utf-8, text/plain`.
 * Splitting only at the first semicolon before checking for this would
 * silently examine just the first segment and ignore that a second,
 * conflicting media type follows.
 */
function hasTopLevelComma(value: string): boolean {
	let inQuotes = false;
	for (const char of value) {
		if (char === '"') {
			inQuotes = !inQuotes;
		} else if (char === ',' && !inQuotes) {
			return true;
		}
	}
	return false;
}

/**
 * Strict content-type matching: exactly one recognized media type, ignoring
 * a trailing `charset`/other parameter but rejecting everything else,
 * including a header carrying more than one comma-separated value —
 * ambiguous encodings are exactly what this guards against, so a second
 * value (whether or not the first segment matches) is rejected outright
 * rather than silently examined only via its first value.
 */
export function isExactContentType(headerValue: string | null, expectedMediaType: string): boolean {
	if (headerValue === null) return false;
	if (hasTopLevelComma(headerValue)) return false;
	const mediaType = headerValue.split(';')[0]?.trim().toLowerCase();
	return mediaType === expectedMediaType;
}
