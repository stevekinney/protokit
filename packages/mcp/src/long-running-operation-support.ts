/**
 * SEC-004: "a timeout must abort the underlying operation rather than
 * merely reject a wrapper promise." The previous implementation raced
 * `operation()` against a timer with `Promise.race` — once the timer won,
 * the wrapper promise rejected, but `operation()` itself kept running with
 * nothing left to observe it: no caller awaiting its result, no signal
 * telling it to stop, and no way to know its eventual resolution (or
 * rejection, which becomes an unhandled rejection) was ever handled. For a
 * fetch, a database query, or any operation that accepts a signal, that
 * means the timeout only stopped *waiting* — it never stopped the work.
 *
 * This still races against a timer, so a caller is guaranteed a result (or
 * rejection) by the deadline even if `operation` ignores cancellation
 * entirely. What's new: `operation` now receives the `AbortSignal` this
 * function creates and aborts on timeout (or on the caller's own
 * `abortSignal` firing), so a caller that threads it into
 * `fetch`/a query/etc. gets genuine cancellation of the underlying work,
 * not just an abandoned promise racing in the background.
 */
export async function runWithStandardizedTimeout<T>(input: {
	operation: (signal: AbortSignal) => Promise<T>;
	timeoutMilliseconds?: number;
	abortSignal?: AbortSignal;
}): Promise<T> {
	const timeoutMilliseconds = input.timeoutMilliseconds ?? 30_000;
	const internalController = new AbortController();

	let timeoutIdentifier: ReturnType<typeof setTimeout> | undefined;
	const onExternalAbort = () => {
		internalController.abort(new Error('Operation cancelled by client.'));
	};

	try {
		return await Promise.race([
			input.operation(internalController.signal),
			new Promise<T>((_, reject) => {
				timeoutIdentifier = setTimeout(() => {
					const timeoutError = new Error(`Operation timed out after ${timeoutMilliseconds}ms.`);
					internalController.abort(timeoutError);
					reject(timeoutError);
				}, timeoutMilliseconds);

				input.abortSignal?.addEventListener('abort', onExternalAbort, { once: true });
				input.abortSignal?.addEventListener(
					'abort',
					() => reject(new Error('Operation cancelled by client.')),
					{ once: true },
				);
			}),
		]);
	} finally {
		// Cleanup runs whether the operation won the race, the timeout won,
		// or the caller's own signal fired — the timer and the external
		// abort listener never outlive this call, and a cooperative
		// `operation` implementation is always told to stop.
		clearTimeout(timeoutIdentifier);
		input.abortSignal?.removeEventListener('abort', onExternalAbort);
		if (!internalController.signal.aborted) {
			internalController.abort(new Error('Operation settled.'));
		}
	}
}

export async function emitRequestProgress(input: {
	sendNotification?: (notification: {
		method: string;
		params: Record<string, unknown>;
	}) => Promise<void>;
	progressToken?: string | number;
	progress: number;
	total?: number;
	message?: string;
}): Promise<void> {
	if (!input.sendNotification || input.progressToken === undefined) {
		return;
	}

	await input.sendNotification({
		method: 'notifications/progress',
		params: {
			progressToken: input.progressToken,
			progress: input.progress,
			...(input.total !== undefined ? { total: input.total } : {}),
			...(input.message ? { message: input.message } : {}),
		},
	});
}
