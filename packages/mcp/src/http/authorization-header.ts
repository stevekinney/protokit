/** Parses the case-insensitive HTTP authentication scheme and its verbatim credential. */
export function parseAuthorizationHeader(header: string | null | undefined): {
	scheme: string | undefined;
	credential: string | undefined;
} {
	if (!header) return { scheme: undefined, credential: undefined };
	const match = /^(\S+)[ \t]+([\s\S]*)$/.exec(header);
	if (!match) return { scheme: undefined, credential: undefined };
	return { scheme: match[1], credential: match[2] };
}
