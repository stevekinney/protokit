/**
 * Races an arbitrary promise against a timer, so an operation with no built-in deadline of its
 * own (a DNS lookup, a Redis command after the connection is already open, a database query
 * against a driver with no per-call timeout option) cannot hold a caller open indefinitely.
 * Rejects with a plain `Error` on timeout rather than resolving a sentinel, so every call site
 * keeps its existing try/catch shape -- a timeout is just one more way the operation failed.
 */
export function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		);
	});
}
