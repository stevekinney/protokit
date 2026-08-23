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
 *
 * A review finding on this file's original version (P2): for a long-lived
 * `subscriptions/listen` response, `handleApplicationRequest` -- and every
 * `fetch` implementation underneath it, down to the MCP SDK's own SSE
 * response construction -- resolves as soon as the `Response` object is
 * *returned*, not when its streaming body finishes being written. The
 * original `track()` decremented `activeCount` the instant `handle()`
 * resolved, so an open SSE stream was reported "done" the moment it
 * STARTED, not when it actually closed. A `SIGTERM` with active listen
 * streams therefore saw `activeCount` drop to 0 almost immediately and
 * `gracefulShutdown` proceeded straight to `shutdownMcpTransports()`,
 * tearing the transport out from under every open stream instead of
 * honoring the drain window -- the exact "abrupt disconnect instead of a
 * clean finish" failure mode this tracker exists to prevent, just for
 * streaming responses instead of ordinary ones. Fixed by tracking a
 * `Response`'s body stream to its actual completion (natural close,
 * cancellation, or error) rather than the promise that produced it.
 *
 * A second review finding (P1), on top of the first fix: a
 * `subscriptions/listen` stream's body only ever settles one of three
 * ways -- the client disconnects, the SDK's own subscription cap evicts
 * it, or this process calls `shutdownMcpTransports()`. During graceful
 * shutdown, that third path is gated behind `drain()` finishing first (see
 * `server.ts`), so counting such a stream toward `activeCount` made
 * `drain()` wait on something only the code AFTER `drain()` can ever
 * release -- bounded by `drain()`'s own timeout, so not a true infinite
 * hang, but every graceful shutdown with an open listen stream burned its
 * *entire* drain budget waiting on nothing, leaving no time for the
 * transport/Redis cleanup that budget exists to protect, and the client
 * still saw the abrupt disconnect this tracker was built to prevent --
 * just delayed by up to the full budget instead of happening instantly.
 * `markAsServerOnlyCloseableStream` lets a caller (`mcp-handler.ts`, for
 * exactly this one response shape) opt a `Response` out of blocking
 * `drain()` while still tracking it structurally the same way -- the one
 * deliberate exception to "no special-cased 'is this streaming' branch"
 * below, because this is not a "how do we detect streaming" branch, it is
 * a "can anything other than our own later shutdown code ever finish
 * this" branch.
 */

/**
 * Marks a `Response` whose body can only be closed by this process's own
 * explicit transport-shutdown call, never by anything `drain()` waiting
 * longer could hasten. See the module comment above for why counting it
 * toward `activeCount` created a self-referential wait.
 *
 * A header, not a non-enumerable object property: confirmed empirically
 * that `mcp-routes.ts` reconstructs the `Response` at least once between
 * `mcp-handler.ts` marking it and `server.ts`'s `track()` ever seeing it
 * (`attachConcurrencySlotToResponseLifetime`'s own body-lifetime wrapper
 * builds a fresh `new Response(trackedBody, { headers: response.headers,
 * ... })`) -- a property set directly on the `Response` instance does not
 * survive that reconstruction, but `headers` is threaded through every
 * such rebuild in this codebase, so a header does. `track()` strips this
 * header from the final `Response` before it can ever reach Bun's actual
 * HTTP output, so it never becomes client-observable.
 */
const serverOnlyCloseableStreamHeader = 'x-protokit-internal-server-only-closeable-stream';

export function markAsServerOnlyCloseableStream(response: Response): Response {
	response.headers.set(serverOnlyCloseableStreamHeader, '1');
	return response;
}

function isServerOnlyCloseableStream(response: Response): boolean {
	return response.headers.has(serverOnlyCloseableStreamHeader);
}

function stripServerOnlyCloseableStreamHeader(response: Response): void {
	response.headers.delete(serverOnlyCloseableStreamHeader);
}

/**
 * Wraps a `Response`'s body so `onBodySettled` fires once the stream is
 * actually done -- closed normally, canceled by the consumer (e.g. a
 * client disconnect), or errored -- instead of when the `Response` object
 * was merely constructed. A `null` body (e.g. 204/304, or a redirect) has
 * nothing left to stream, so it settles immediately. Every other response
 * shape (an ordinary buffered JSON body just as much as a long-lived SSE
 * stream) is handled identically -- there is no special-cased "is this
 * streaming" branch to keep in sync with the SDK's own transport choices.
 */
function trackResponseBody(response: Response, onBodySettled: () => void): Response {
	if (!response.body || response.bodyUsed) {
		onBodySettled();
		return response;
	}

	let settled = false;
	const settleOnce = (): void => {
		if (settled) return;
		settled = true;
		onBodySettled();
	};

	const sourceReader = response.body.getReader();
	const trackedBody = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await sourceReader.read();
				if (done) {
					controller.close();
					settleOnce();
					return;
				}
				controller.enqueue(value);
			} catch (error) {
				controller.error(error);
				settleOnce();
			}
		},
		cancel(reason) {
			sourceReader.cancel(reason).catch(() => {});
			settleOnce();
		},
	});

	return new Response(trackedBody, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

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
		/**
		 * Wraps one request's handling; call this from `fetch` around the
		 * real response promise. If the resolved value is a `Response`, this
		 * request stays counted as active until that response's body stream
		 * actually finishes -- not merely until the `Response` was returned
		 * -- so a long-lived SSE stream keeps `drain()` waiting for as long
		 * as it stays open.
		 *
		 * Exception: a `Response` marked with `markAsServerOnlyCloseableStream`
		 * is decremented immediately instead, the same as a non-streaming
		 * result. See the module comment for why -- waiting on it would be
		 * waiting on a call that only happens after this wait is over.
		 */
		async track<T>(handle: () => Promise<T>): Promise<T> {
			activeCount++;
			let bodyTrackingStarted = false;
			try {
				const result = await handle();
				if (result instanceof Response) {
					if (isServerOnlyCloseableStream(result)) {
						stripServerOnlyCloseableStreamHeader(result);
						return result;
					}
					bodyTrackingStarted = true;
					return trackResponseBody(result, () => {
						activeCount--;
						notifyIfDrained();
					}) as T;
				}
				return result;
			} finally {
				if (!bodyTrackingStarted) {
					activeCount--;
					notifyIfDrained();
				}
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
