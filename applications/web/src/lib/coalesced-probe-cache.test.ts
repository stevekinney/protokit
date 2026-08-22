import { describe, expect, it } from 'bun:test';
import { createCoalescedProbe } from '@web/lib/coalesced-probe-cache';

describe('createCoalescedProbe', () => {
	it('coalesces concurrent callers into a single in-flight probe', async () => {
		let probeCallCount = 0;
		const probe = createCoalescedProbe({
			ttlMs: 1000,
			probe: async () => {
				probeCallCount += 1;
				return probeCallCount;
			},
		});

		const [first, second, third] = await Promise.all([probe(), probe(), probe()]);

		expect(probeCallCount).toBe(1);
		expect(first).toBe(1);
		expect(second).toBe(1);
		expect(third).toBe(1);
	});

	it('serves the cached result until the TTL expires', async () => {
		let probeCallCount = 0;
		let clock = 0;
		const probe = createCoalescedProbe({
			ttlMs: 1000,
			now: () => clock,
			probe: async () => {
				probeCallCount += 1;
				return probeCallCount;
			},
		});

		expect(await probe()).toBe(1);
		clock += 500;
		expect(await probe()).toBe(1);
		expect(probeCallCount).toBe(1);

		clock += 501;
		expect(await probe()).toBe(2);
		expect(probeCallCount).toBe(2);
	});

	it('re-probes immediately after a rejected probe rather than caching the failure', async () => {
		let probeCallCount = 0;
		const probe = createCoalescedProbe<number>({
			ttlMs: 1000,
			probe: async () => {
				probeCallCount += 1;
				if (probeCallCount === 1) {
					throw new Error('probe failed');
				}
				return probeCallCount;
			},
		});

		await expect(probe()).rejects.toThrow('probe failed');
		expect(await probe()).toBe(2);
		expect(probeCallCount).toBe(2);
	});

	it('lets a second caller join an in-flight probe that ultimately rejects', async () => {
		let resolveProbe: ((value: number) => void) | undefined;
		let rejectProbe: ((error: Error) => void) | undefined;
		let probeCallCount = 0;
		const probe = createCoalescedProbe<number>({
			ttlMs: 1000,
			probe: () =>
				new Promise((resolve, reject) => {
					probeCallCount += 1;
					resolveProbe = resolve;
					rejectProbe = reject;
				}),
		});

		const firstCall = probe().catch((error: Error) => error);
		const secondCall = probe().catch((error: Error) => error);
		rejectProbe?.(new Error('boom'));

		const [firstResult, secondResult] = await Promise.all([firstCall, secondCall]);
		expect((firstResult as Error).message).toBe('boom');
		expect((secondResult as Error).message).toBe('boom');
		expect(probeCallCount).toBe(1);
		void resolveProbe;
	});
});
