/**
 * OAuth 2.1 / RFC 6749 §3.1 requires request parameters to appear at most
 * once; a duplicate is ambiguous (which value applies?) rather than merely
 * redundant, so it is rejected outright instead of taking the first or last
 * occurrence silently. Works for both `URLSearchParams` (query strings) and
 * form-urlencoded bodies parsed the same way — see
 * `readBoundedFormUrlEncoded`.
 */
export function findDuplicateParameterName(
	searchParams: URLSearchParams,
	parameterNames: readonly string[],
): string | null {
	for (const name of parameterNames) {
		if (searchParams.getAll(name).length > 1) {
			return name;
		}
	}
	return null;
}
