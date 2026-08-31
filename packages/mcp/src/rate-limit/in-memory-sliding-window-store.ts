import type { AtomicSlidingWindowStore } from '../oauth/index.js';

type ScoredMember = { score: number; member: string };

export function createInMemorySlidingWindowStore(): AtomicSlidingWindowStore {
	const membersByKey = new Map<string, ScoredMember[]>();
	const expirationsByKey = new Map<string, number>();

	const pruneExpired = (key: string, nowMilliseconds: number, cutoffScore: number) => {
		const expiresAt = expirationsByKey.get(key);
		if (expiresAt !== undefined && nowMilliseconds > expiresAt) {
			membersByKey.delete(key);
			expirationsByKey.delete(key);
			return [];
		}
		const remaining = (membersByKey.get(key) ?? []).filter((entry) => entry.score > cutoffScore);
		membersByKey.set(key, remaining);
		return remaining;
	};

	return {
		consume: async (input) => {
			const existing = pruneExpired(
				input.key,
				input.nowMilliseconds,
				input.nowMilliseconds - input.windowMilliseconds,
			);
			if (existing.length >= input.maximumRequests) {
				const oldest = existing.reduce((minimum, entry) =>
					entry.score < minimum.score ? entry : minimum,
				);
				return {
					allowed: false,
					retryAfterMilliseconds: Math.max(
						0,
						oldest.score + input.windowMilliseconds - input.nowMilliseconds,
					),
					remainingRequests: 0,
				};
			}
			existing.push({ score: input.nowMilliseconds, member: input.member });
			membersByKey.set(input.key, existing);
			expirationsByKey.set(input.key, input.nowMilliseconds + input.windowMilliseconds);
			return {
				allowed: true,
				retryAfterMilliseconds: 0,
				remainingRequests: Math.max(0, input.maximumRequests - existing.length),
			};
		},
		peek: async (input) =>
			pruneExpired(
				input.key,
				input.nowMilliseconds,
				input.nowMilliseconds - input.windowMilliseconds,
			).length,
	};
}

export const inMemorySlidingWindowStore = createInMemorySlidingWindowStore();
