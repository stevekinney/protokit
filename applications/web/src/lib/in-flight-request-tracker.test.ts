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
