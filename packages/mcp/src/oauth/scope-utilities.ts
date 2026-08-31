export function splitScopes(value: string): string[] {
	return value.split(/\s+/).filter(Boolean);
}

export function canonicalizeScopes(values: readonly string[]): string {
	return [...new Set(values)].sort().join(' ');
}

export function parseRequestedScope<Scope extends string>(
	value: string | null,
	supportedScopes: readonly Scope[],
): { ok: true; scope: string } | { ok: false; unknownScopes: string[] } {
	if (value === null) return { ok: true, scope: canonicalizeScopes(supportedScopes) };
	if (!value.trim()) return { ok: false, unknownScopes: [] };
	const values = splitScopes(value);
	const unknownScopes = values.filter((scope) => !supportedScopes.includes(scope as Scope));
	if (unknownScopes.length > 0) return { ok: false, unknownScopes };
	return { ok: true, scope: canonicalizeScopes(values) };
}

export function parseRefreshScope<Scope extends string>(
	value: string | undefined,
	supportedScopes: readonly Scope[],
): { ok: true; requestedScope?: string } | { ok: false } {
	if (value === undefined) return { ok: true };
	if (!value.trim()) return { ok: false };
	const values = splitScopes(value);
	if (values.some((scope) => !supportedScopes.includes(scope as Scope))) return { ok: false };
	return { ok: true, requestedScope: canonicalizeScopes(values) };
}
