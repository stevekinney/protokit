import type { AtomicSlidingWindowStore } from '@web/lib/sliding-window-rate-limiter';

type ScoredMember = { score: number; member: string };

const store = new Map<string, ScoredMember[]>();
const expirations = new Map<string, number>();

function pruneExpired(key: string, nowMilliseconds: number, cutoffScore: number): ScoredMember[] {
	const expiresAt = expirations.get(key);
	if (expiresAt !== undefined && nowMilliseconds > expiresAt) {
		store.delete(key);
		expirations.delete(key);
		return [];
	}

	const remaining = (store.get(key) ?? []).filter((entry) => entry.score > cutoffScore);
	store.set(key, remaining);
	return remaining;
}

/**
 * A single-process, in-memory implementation of `AtomicSlidingWindowStore`.
 * Every operation runs synchronously (no `await` inside the critical
 * section), so concurrent callers on Bun's single-threaded event loop can
 * never interleave mid-mutation — the `async` keyword here only wraps the
 * already-computed result in a resolved Promise. This makes it genuinely
 * atomic for a single process, but it shares no state across processes,
 * which is exactly why production requires the Redis-backed store instead.
 */
export const inMemorySlidingWindowStore: AtomicSlidingWindowStore = {
	consume: async (input) => {
		const cutoffScore = input.nowMilliseconds - input.windowMilliseconds;
		const existing = pruneExpired(input.key, input.nowMilliseconds, cutoffScore);

		if (existing.length >= input.maximumRequests) {
			const oldest = existing.reduce((min, entry) => (entry.score < min.score ? entry : min));
			const retryAfterMilliseconds = Math.max(
				0,
				oldest.score + input.windowMilliseconds - input.nowMilliseconds,
			);
			return { allowed: false, retryAfterMilliseconds, remainingRequests: 0 };
		}

		existing.push({ score: input.nowMilliseconds, member: input.member });
		store.set(input.key, existing);
		expirations.set(input.key, input.nowMilliseconds + input.windowMilliseconds);

		return {
			allowed: true,
			retryAfterMilliseconds: 0,
			remainingRequests: Math.max(0, input.maximumRequests - existing.length),
		};
	},

	peek: async (input) => {
		const cutoffScore = input.nowMilliseconds - input.windowMilliseconds;
		return pruneExpired(input.key, input.nowMilliseconds, cutoffScore).length;
	},
};

/** Test-only: clears all in-memory rate-limit state between test cases. */
export function resetInMemorySlidingWindowStore(): void {
	store.clear();
	expirations.clear();
}
