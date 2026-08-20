import { describe, expect, it } from 'bun:test';
import { runWithStandardizedTimeout } from './long-running-operation-support.js';

describe('runWithStandardizedTimeout', () => {
	it('resolves with the operation result when it finishes before the timeout', async () => {
		const result = await runWithStandardizedTimeout({
			operation: async () => 'done',
			timeoutMilliseconds: 1000,
		});
		expect(result).toBe('done');
	});

	it('rejects once the timeout elapses even if the operation never settles', async () => {
		let thrown: unknown;
		try {
			await runWithStandardizedTimeout({
				operation: () => new Promise<never>(() => {}), // never resolves or rejects
				timeoutMilliseconds: 20,
			});
		} catch (error) {
			thrown = error;
		}
		expect(thrown instanceof Error).toBe(true);
		expect((thrown as Error).message).toContain('timed out');
	});

	it('aborts the signal handed to a cooperative operation once the timeout fires, proving the underlying work is actually cancelled', async () => {
		let observedAbort = false;
		let signalAtSettle: AbortSignal | undefined;

		let thrown: unknown;
		try {
			await runWithStandardizedTimeout({
				operation: (signal) =>
					new Promise<never>((_, reject) => {
						signalAtSettle = signal;
						signal.addEventListener(
							'abort',
							() => {
								observedAbort = true;
								reject(signal.reason);
							},
							{ once: true },
						);
					}),
				timeoutMilliseconds: 20,
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).not.toBeNull();
		expect(observedAbort).toBe(true);
		expect(signalAtSettle?.aborted).toBe(true);
	});

	it('aborts the operation signal when the caller-provided abortSignal fires, not merely on timeout', async () => {
		const callerController = new AbortController();
		let observedReason: unknown;

		const promise = runWithStandardizedTimeout({
			operation: (signal) =>
				new Promise<never>((_, reject) => {
					signal.addEventListener(
						'abort',
						() => {
							observedReason = signal.reason;
							reject(signal.reason);
						},
						{ once: true },
					);
				}),
			timeoutMilliseconds: 5000,
			abortSignal: callerController.signal,
		});

		callerController.abort();

		let thrown: unknown;
		try {
			await promise;
		} catch (error) {
			thrown = error;
		}

		expect(thrown instanceof Error).toBe(true);
		expect((thrown as Error).message).toContain('cancelled');
		expect(observedReason instanceof Error).toBe(true);
	});

	it('marks the internal signal aborted after a successful operation settles, so nothing is left listening', async () => {
		let capturedSignal: AbortSignal | undefined;
		await runWithStandardizedTimeout({
			operation: async (signal) => {
				capturedSignal = signal;
				return 'ok';
			},
			timeoutMilliseconds: 1000,
		});
		expect(capturedSignal?.aborted).toBe(true);
	});
});
