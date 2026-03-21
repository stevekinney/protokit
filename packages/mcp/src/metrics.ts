export type ToolMetricEntry = {
	invocations: number;
	errors: number;
	durations: number[];
};

export type MetricsSnapshot = {
	tools: Record<
		string,
		{ invocations: number; errors: number; p50: number; p95: number; p99: number }
	>;
	activeSessions: number;
	uptimeSeconds: number;
	collectedAt: string;
};

const MAX_DURATIONS = 1000;

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

class MetricsCollector {
	private tools = new Map<string, ToolMetricEntry>();
	private sessionCount = 0;
	private startedAt = Date.now();

	recordToolInvocation(name: string, durationMs: number, isError: boolean): void {
		let entry = this.tools.get(name);
		if (!entry) {
			entry = { invocations: 0, errors: 0, durations: [] };
			this.tools.set(name, entry);
		}
		entry.invocations++;
		if (isError) entry.errors++;
		entry.durations.push(durationMs);
		if (entry.durations.length > MAX_DURATIONS) {
			entry.durations = entry.durations.slice(-MAX_DURATIONS);
		}
	}

	incrementActiveSessions(): void {
		this.sessionCount++;
	}

	decrementActiveSessions(): void {
		this.sessionCount = Math.max(0, this.sessionCount - 1);
	}

	snapshot(): MetricsSnapshot {
		const tools: MetricsSnapshot['tools'] = {};
		for (const [name, entry] of this.tools) {
			const sorted = [...entry.durations].sort((a, b) => a - b);
			tools[name] = {
				invocations: entry.invocations,
				errors: entry.errors,
				p50: percentile(sorted, 50),
				p95: percentile(sorted, 95),
				p99: percentile(sorted, 99),
			};
		}
		return {
			tools,
			activeSessions: this.sessionCount,
			uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
			collectedAt: new Date().toISOString(),
		};
	}

	reset(): void {
		this.tools.clear();
		this.sessionCount = 0;
		this.startedAt = Date.now();
	}
}

export const metricsCollector = new MetricsCollector();
