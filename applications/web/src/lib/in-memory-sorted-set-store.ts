type ScoredMember = { score: number; member: string };

const store = new Map<string, ScoredMember[]>();
const expirations = new Map<string, number>();

function pruneExpired(key: string): ScoredMember[] {
	const expiresAt = expirations.get(key);
	if (expiresAt !== undefined && Date.now() > expiresAt) {
		store.delete(key);
		expirations.delete(key);
		return [];
	}
	return store.get(key) ?? [];
}

export const inMemorySortedSetStore = {
	removeRangeByScore: async (key: string, minimumScore: number, maximumScore: number) => {
		const entries = pruneExpired(key);
		const filtered = entries.filter(
			(entry) => entry.score < minimumScore || entry.score > maximumScore,
		);
		store.set(key, filtered);
	},

	count: async (key: string) => {
		return pruneExpired(key).length;
	},

	add: async (key: string, score: number, member: string) => {
		const entries = pruneExpired(key);
		entries.push({ score, member });
		store.set(key, entries);
	},

	getOldestScore: async (key: string) => {
		const entries = pruneExpired(key);
		if (entries.length === 0) return null;
		let oldest = entries[0].score;
		for (const entry of entries) {
			if (entry.score < oldest) oldest = entry.score;
		}
		return oldest;
	},

	expire: async (key: string, seconds: number) => {
		expirations.set(key, Date.now() + seconds * 1000);
	},
};
