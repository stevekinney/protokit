export function splitScopes(value: string): string[] {
	return value.split(/\s+/).filter(Boolean);
}

export function canonicalizeScopes(values: readonly string[]): string {
	return [...new Set(values)].sort().join(' ');
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
