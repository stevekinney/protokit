/**
 * SEC-004: bound generated tool result content the same way inbound
 * requests are bounded. Every tool response in this codebase is built
 * through one of these three functions, so this is the single place a
 * cap on result size needs to live — no per-tool changes required, and no
 * new tool can accidentally skip it.
 *
 * A result that exceeds the cap is replaced with a stable, `isError: true`
 * response rather than silently truncated: truncating a JSON string mid-way
 * would hand the caller invalid JSON, which is worse than a clear failure.
 */
const maxToolResultBytes = 256 * 1024;

/**
 * SEC-004: the cap is measured in UTF-8 bytes, which is what actually goes on
 * the wire — not `String.length`, which counts UTF-16 code units.
 *
 * The two diverge by up to 3x for non-ASCII output: 250,000 CJK characters
 * satisfy a 256K *character* check and encode to roughly 750KB, nearly three
 * times the advertised limit, on a bound whose entire purpose is stopping
 * oversized payloads reaching a client.
 *
 * That defect survived its own tests because they pad with ASCII, where
 * characters and bytes coincide — the cap read as enforced while the
 * guarantee was absent for exactly the inputs that would breach it.
 */
const textEncoder = new TextEncoder();

/**
 * Returns the UTF-8 byte length when it exceeds the cap, or `null` when it
 * does not.
 *
 * The length check first is a fast path, not an approximation: UTF-8 uses at
 * most three bytes per UTF-16 code unit, so a string of at most a third of the
 * cap in code units cannot exceed the cap in bytes and never needs encoding.
 * Only strings that might breach it pay for the encode.
 */
function exceededByteLength(text: string): number | null {
	if (text.length * 3 <= maxToolResultBytes) return null;
	const byteLength = textEncoder.encode(text).length;
	return byteLength > maxToolResultBytes ? byteLength : null;
}

function boundedTextContent(text: string): { content: [{ type: 'text'; text: string }] } {
	const exceeded = exceededByteLength(text);
	if (exceeded !== null) {
		return {
			content: [
				{
					type: 'text',
					text: `Result omitted: exceeded the ${maxToolResultBytes}-byte tool result limit (was ${exceeded} bytes).`,
				},
			],
		};
	}
	return { content: [{ type: 'text', text }] };
}

export function createToolTextResponse(text: string) {
	const bounded = boundedTextContent(text);
	if (bounded.content[0].text !== text) {
		return { ...bounded, isError: true };
	}
	return bounded;
}

export function createToolJsonResponse(data: unknown) {
	// `JSON.stringify` returns `undefined` (not the string `"undefined"`) for
	// `undefined`, symbols, and functions; normalize to `"null"` so this
	// always has a string to bound and callers always get valid JSON text.
	const serialized = JSON.stringify(data) ?? 'null';
	const bounded = boundedTextContent(serialized);
	if (bounded.content[0].text !== serialized) {
		return { ...bounded, isError: true };
	}
	return bounded;
}

export function createToolErrorResponse(message: string) {
	const bounded = boundedTextContent(message);
	return {
		...bounded,
		isError: true,
	};
}

/**
 * META-001: the response shape for a tool that declares an `outputSchema`.
 * `structuredContent` carries the data a client validates against that
 * schema; `summary` is the separate, intentional human-readable text the
 * roadmap asks for ("text content only for an intentional human-readable
 * summary") rather than a second copy of the same JSON as text.
 *
 * Both the summary and the structured payload go through the same
 * SEC-004 size bound as every other tool response.
 */
export function createToolStructuredResponse<T>(data: T, summary: string) {
	const boundedSummary = boundedTextContent(summary);
	if (boundedSummary.content[0].text !== summary) {
		return { ...boundedSummary, isError: true };
	}

	const serialized = JSON.stringify(data) ?? 'null';
	// Both callsites, deliberately. Fixing one and leaving the other reproduces
	// exactly the illusion this change removes: a cap that reads as enforced
	// and is not, for the half of the surface nobody re-checked.
	const exceededSerialized = exceededByteLength(serialized);
	if (exceededSerialized !== null) {
		return {
			content: [
				{
					type: 'text' as const,
					text: `Result omitted: exceeded the ${maxToolResultBytes}-byte tool result limit (was ${exceededSerialized} bytes).`,
				},
			],
			isError: true,
		};
	}

	return { ...boundedSummary, structuredContent: data };
}
