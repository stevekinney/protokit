/**
 * `OPS-001`: tracks how many requests `server.ts`'s `fetch` handler is
 * currently processing, so graceful shutdown can wait for them to finish
 * before tearing down the MCP transports that serve them.
 *
 * Found empirically, not assumed: `Bun.serve(...).stop(false)` stops
 * accepting new connections and returns immediately -- it does NOT wait
 * for in-flight request handlers to finish. Before this tracker existed,
 * `gracefulShutdown()` called `shutdownMcpTransports()` (which closes
 * every active `McpHttpHandler`) right after `stop(false)`, so a request
 * still being processed had its transport torn out from under it and the
 * client observed an abrupt "socket connection closed unexpectedly"
 * instead of either its real result or a clean rejection. Draining first
 * closes that gap: `shutdownMcpTransports()` now only runs once every
 * request the process was already handling has actually finished (or a
 * bounded timeout elapses, so a single stuck request can never hang
 * shutdown forever).
 */
export function createInFlightRequestTracker() {
	let activeCount = 0;
	let onDrainedResolvers: Array<() => void> = [];

	function notifyIfDrained(): void {
		if (activeCount === 0 && onDrainedResolvers.length > 0) {
			const resolvers = onDrainedResolvers;
			onDrainedResolvers = [];
			for (const resolve of resolvers) resolve();
		}
	}

	return {
		/** Wraps one request's handling; call this from `fetch` around the real response promise. */
		async track<T>(handle: () => Promise<T>): Promise<T> {
			activeCount++;
			try {
				return await handle();
			} finally {
				activeCount--;
				notifyIfDrained();
			}
		},

		/** The current number of requests still being handled. */
		get activeCount(): number {
			return activeCount;
		},

		/**
		 * Resolves once every currently-tracked request has finished, or
		 * `timeoutMs` elapses -- whichever comes first. Never rejects: a
		 * timed-out drain is a signal to proceed with shutdown anyway, not
		 * an error.
		 */
		async drain(timeoutMs: number): Promise<{ drained: boolean; remaining: number }> {
			if (activeCount === 0) return { drained: true, remaining: 0 };

			await new Promise<void>((resolve) => {
				const timeout = setTimeout(resolve, timeoutMs);
				onDrainedResolvers.push(() => {
					clearTimeout(timeout);
					resolve();
				});
			});

			return { drained: activeCount === 0, remaining: activeCount };
		},
	};
}

export type InFlightRequestTracker = ReturnType<typeof createInFlightRequestTracker>;
