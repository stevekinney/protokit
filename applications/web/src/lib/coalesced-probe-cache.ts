/**
 * OPS-002: wraps an expensive, idempotent probe (a Postgres `select 1`, a
 * Redis `ping`) so a burst of callers within `ttlMs` shares one real probe
 * instead of each triggering its own dependency connection. Two things
 * happen together here, not one: concurrent callers *coalesce* onto the same
 * in-flight promise (no duplicate work while a probe is running), and the
 * settled result is *cached* for the remainder of the window (no new probe
 * at all until it expires) — either alone would still let a request storm
 * multiply dependency work.
 *
 * Returned as a factory rather than a module-level singleton so
 * `readiness-probe-cache.test.ts` can construct an isolated instance per
 * test (a shared module-level cache would leak state across test files in
 * one `bun test` invocation, the same reason `mcp-origin-validation.ts` and
 * `session-signing-secret.ts` take their inputs as parameters instead of
 * reading a shared singleton).
 */
export function createCoalescedProbe<T>(input: {
	ttlMs: number;
	probe: () => Promise<T>;
	now?: () => number;
}): () => Promise<T> {
	const now = input.now ?? Date.now;

	let cachedResult: { value: T; expiresAt: number } | null = null;
	let inFlight: Promise<T> | null = null;

	return async function getCachedOrFreshResult(): Promise<T> {
		if (cachedResult && cachedResult.expiresAt > now()) {
			return cachedResult.value;
		}

		if (inFlight) {
			return inFlight;
		}

		inFlight = input
			.probe()
			.then((value) => {
				cachedResult = { value, expiresAt: now() + input.ttlMs };
				return value;
			})
			.finally(() => {
				inFlight = null;
			});

		return inFlight;
	};
}
