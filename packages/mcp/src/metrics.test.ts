import { beforeEach, describe, expect, it } from 'bun:test';
import { metricsCollector } from './metrics';

describe('metricsCollector', () => {
	beforeEach(() => {
		metricsCollector.reset();
	});

	it('records tool invocations and tracks counts', () => {
		metricsCollector.recordToolInvocation('my_tool', 100, false);
		metricsCollector.recordToolInvocation('my_tool', 200, false);
		metricsCollector.recordToolInvocation('my_tool', 300, true);

		const snapshot = metricsCollector.snapshot();
		expect(snapshot.tools.my_tool.invocations).toBe(3);
		expect(snapshot.tools.my_tool.errors).toBe(1);
	});

	it('computes percentiles from recorded durations', () => {
		for (let i = 1; i <= 100; i++) {
			metricsCollector.recordToolInvocation('perf_tool', i, false);
		}

		const snapshot = metricsCollector.snapshot();
		expect(snapshot.tools.perf_tool.p50).toBe(50);
		expect(snapshot.tools.perf_tool.p95).toBe(95);
		expect(snapshot.tools.perf_tool.p99).toBe(99);
	});

	it('clears durations after snapshot', () => {
		metricsCollector.recordToolInvocation('clear_test', 42, false);
		metricsCollector.snapshot();
		const second = metricsCollector.snapshot();
		expect(second.tools.clear_test.p50).toBe(0);
	});

	it('tracks active sessions', () => {
		metricsCollector.incrementActiveSessions();
		metricsCollector.incrementActiveSessions();
		metricsCollector.decrementActiveSessions();

		const snapshot = metricsCollector.snapshot();
		expect(snapshot.activeSessions).toBe(1);
	});

	it('does not decrement below zero', () => {
		metricsCollector.decrementActiveSessions();
		metricsCollector.decrementActiveSessions();
		const snapshot = metricsCollector.snapshot();
		expect(snapshot.activeSessions).toBe(0);
	});

	it('returns the expected snapshot shape', () => {
		const snapshot = metricsCollector.snapshot();
		expect(snapshot).toHaveProperty('tools');
		expect(snapshot).toHaveProperty('activeSessions');
		expect(snapshot).toHaveProperty('uptimeSeconds');
		expect(snapshot).toHaveProperty('collectedAt');
		expect(typeof snapshot.collectedAt).toBe('string');
	});

	it('resets all state', () => {
		metricsCollector.recordToolInvocation('reset_test', 10, false);
		metricsCollector.incrementActiveSessions();
		metricsCollector.reset();

		const snapshot = metricsCollector.snapshot();
		expect(Object.keys(snapshot.tools)).toHaveLength(0);
		expect(snapshot.activeSessions).toBe(0);
	});
});
