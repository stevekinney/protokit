export async function runWithStandardizedTimeout<T>(input: {
	operation: () => Promise<T>;
	timeoutMilliseconds?: number;
	abortSignal?: AbortSignal;
}): Promise<T> {
	const timeoutMilliseconds = input.timeoutMilliseconds ?? 30_000;

	return await Promise.race([
		input.operation(),
		new Promise<T>((_, reject) => {
			const timeoutIdentifier = setTimeout(() => {
				reject(new Error(`Operation timed out after ${timeoutMilliseconds}ms.`));
			}, timeoutMilliseconds);

			input.abortSignal?.addEventListener(
				'abort',
				() => {
					clearTimeout(timeoutIdentifier);
					reject(new Error('Operation cancelled by client.'));
				},
				{ once: true },
			);
		}),
	]);
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
