import { describe, expect, it } from 'bun:test';
import { createInFlightRequestTracker } from '@web/lib/in-flight-request-tracker';

describe('createInFlightRequestTracker', () => {
	it('drains immediately when nothing is in flight', async () => {
		const tracker = createInFlightRequestTracker();
		const result = await tracker.drain(1_000);
		expect(result).toEqual({ drained: true, remaining: 0 });
	});

	it('waits for an in-flight request to finish before resolving drain', async () => {
		const tracker = createInFlightRequestTracker();
		let resolveRequest!: () => void;
		const requestPromise = new Promise<void>((resolve) => {
			resolveRequest = resolve;
		});

		const trackedPromise = tracker.track(() => requestPromise);
		expect(tracker.activeCount).toBe(1);

		const drainPromise = tracker.drain(5_000);
		// Give the drain call a tick to actually start waiting before the
		// request finishes, so this proves drain observed activeCount > 0
		// rather than racing past it.
		await Bun.sleep(10);

		resolveRequest();
		await trackedPromise;

		const result = await drainPromise;
		expect(result).toEqual({ drained: true, remaining: 0 });
		expect(tracker.activeCount).toBe(0);
	});

	it('times out and reports the remaining count rather than hanging forever', async () => {
		const tracker = createInFlightRequestTracker();
		const neverResolves = new Promise<void>(() => {});
		void tracker.track(() => neverResolves);

		const result = await tracker.drain(50);
		expect(result.drained).toBe(false);
		expect(result.remaining).toBe(1);
	});

	it('decrements on a rejected handler too, not just a resolved one', async () => {
		const tracker = createInFlightRequestTracker();
		await expect(
			tracker.track(async () => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		expect(tracker.activeCount).toBe(0);
	});

	// A review finding on `server.ts` (P2): for a long-lived streaming
	// response (`subscriptions/listen`), the handler that constructs the
	// `Response` returns as soon as the SSE stream is opened, not when it
	// closes. `track()` used to decrement `activeCount` at that point,
	// so a shutdown drain never actually waited for an open stream.
	it('keeps a streamed Response counted as active until its body stream closes, not until the Response is returned', async () => {
		const tracker = createInFlightRequestTracker();
		let enqueueChunk!: (chunk: Uint8Array) => void;
		let closeStream!: () => void;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				enqueueChunk = (chunk) => controller.enqueue(chunk);
				closeStream = () => controller.close();
			},
		});

		const trackedResponsePromise = tracker.track(async () => new Response(body));
		const trackedResponse = await trackedResponsePromise;
		// The Response was returned already, but nothing has been read from
		// its body yet -- a naive "decrement when the handler resolves"
		// tracker would already report 0 here, which is exactly the bug.
		expect(tracker.activeCount).toBe(1);

		const reader = trackedResponse.body!.getReader();
		const readPromise = reader.read();
		enqueueChunk(new TextEncoder().encode('event: ping\n\n'));
		expect((await readPromise).done).toBe(false);
		// Still open after delivering a chunk -- this is the SSE keep-alive
		// case, which can repeat for as long as the stream stays open.
		expect(tracker.activeCount).toBe(1);

		const drainPromise = tracker.drain(5_000);
		await Bun.sleep(10);
		// The drain must still be waiting: the stream has not closed yet.
		expect(tracker.activeCount).toBe(1);

		const finalRead = reader.read();
		closeStream();
		expect((await finalRead).done).toBe(true);

		const result = await drainPromise;
		expect(result).toEqual({ drained: true, remaining: 0 });
		expect(tracker.activeCount).toBe(0);
	});

	it('settles a canceled streamed Response body immediately, without waiting for a close that will never come', async () => {
		const tracker = createInFlightRequestTracker();
		const body = new ReadableStream<Uint8Array>({
			start() {
				// Never enqueues or closes -- only cancellation ends this stream.
			},
		});

		const trackedResponse = await tracker.track(async () => new Response(body));
		expect(tracker.activeCount).toBe(1);

		await trackedResponse.body!.cancel('client disconnected');

		expect(tracker.activeCount).toBe(0);
	});

	it('drains only once every concurrently-tracked request finishes', async () => {
		const tracker = createInFlightRequestTracker();
		let resolveFirst!: () => void;
		let resolveSecond!: () => void;
		const first = tracker.track(() => new Promise<void>((resolve) => (resolveFirst = resolve)));
		const second = tracker.track(() => new Promise<void>((resolve) => (resolveSecond = resolve)));
		expect(tracker.activeCount).toBe(2);

		const drainPromise = tracker.drain(5_000);
		resolveFirst();
		await first;
		await Bun.sleep(10);
		expect(tracker.activeCount).toBe(1);

		resolveSecond();
		await second;

		const result = await drainPromise;
		expect(result).toEqual({ drained: true, remaining: 0 });
	});
});
