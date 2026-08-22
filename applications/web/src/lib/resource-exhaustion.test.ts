import { describe, expect, it } from 'bun:test';
import {
	boundRequestBody,
	PayloadTooLargeError,
	readBoundedBytes,
} from '@web/lib/bounded-request-body';

/**
 * Acceptance criterion 5: "Timeout and disconnect tests prove the
 * underlying work is cancelled and timers/listeners are cleaned up." These
 * tests instrument the *source* stream directly (the thing a real network
 * socket would back) to prove `boundRequestBody`/`readBoundedBytes` cancel
 * it the instant the byte cap is crossed — not merely reject a wrapper
 * promise while the source keeps being read in the background, which would
 * leave an unbounded read in flight against a resource an attacker fully
 * controls.
 */
function instrumentedOversizedSource(totalChunks: number, chunkSize: number) {
	let pulledChunks = 0;
	let cancelled = false;
	let cancelReason: unknown;

	const source = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (pulledChunks >= totalChunks) {
				controller.close();
				return;
			}
			pulledChunks += 1;
			controller.enqueue(new Uint8Array(chunkSize).fill(120));
		},
		cancel(reason) {
			cancelled = true;
			cancelReason = reason;
		},
	});

	return {
		source,
		wasCancelled: () => cancelled,
		reasonWasPayloadTooLarge: () => cancelReason instanceof PayloadTooLargeError,
		chunksPulled: () => pulledChunks,
	};
}

describe('resource exhaustion: cancellation and bounded memory', () => {
	it('readBoundedBytes cancels the source stream, not just the returned promise, on overflow', async () => {
		const totalChunks = 1000; // if unbounded, this would pull 1000 * 1KB = ~1MB
		const chunkSize = 1024;
		const instrumented = instrumentedOversizedSource(totalChunks, chunkSize);
		const request = new Request('http://localhost/x', {
			method: 'POST',
			body: instrumented.source,
			duplex: 'half',
		} as RequestInit);

		let thrown: unknown;
		try {
			await readBoundedBytes(request, 4096); // limit: 4 chunks worth
		} catch (error) {
			thrown = error;
		}

		expect(thrown instanceof PayloadTooLargeError).toBe(true);
		expect(instrumented.wasCancelled()).toBe(true);
		expect(instrumented.reasonWasPayloadTooLarge()).toBe(true);
		// Bounded memory: the reader must not have drained anywhere near all
		// 1000 chunks before the cap stopped it.
		expect(instrumented.chunksPulled() < 20).toBe(true);
	});

	it('boundRequestBody cancels the source stream when the wrapped Request is consumed past the limit', async () => {
		const totalChunks = 1000;
		const chunkSize = 1024;
		const instrumented = instrumentedOversizedSource(totalChunks, chunkSize);
		const request = new Request('http://localhost/x', {
			method: 'POST',
			body: instrumented.source,
			duplex: 'half',
		} as RequestInit);

		const bounded = boundRequestBody(request, 4096);

		let thrown: unknown;
		try {
			await bounded.text();
		} catch (error) {
			thrown = error;
		}

		expect(thrown instanceof PayloadTooLargeError).toBe(true);
		expect(instrumented.wasCancelled()).toBe(true);
		expect(instrumented.chunksPulled() < 20).toBe(true);
	});

	it('never cancels a source stream that stays within the limit', async () => {
		const instrumented = instrumentedOversizedSource(3, 100); // 300 bytes total, well under the cap
		const request = new Request('http://localhost/x', {
			method: 'POST',
			body: instrumented.source,
			duplex: 'half',
		} as RequestInit);

		const bytes = await readBoundedBytes(request, 10_000);

		expect(bytes.byteLength).toBe(300);
		expect(instrumented.wasCancelled()).toBe(false);
	});
});
