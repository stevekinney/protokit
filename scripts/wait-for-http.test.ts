import { describe, expect, test } from 'bun:test';

import { parseArguments, waitForHttp } from './wait-for-http.ts';

describe('waitForHttp', () => {
	test('resolves as soon as the server answers, regardless of status code', async () => {
		using server = Bun.serve({ port: 0, fetch: () => new Response('not ready', { status: 503 }) });
		await expect(
			waitForHttp({ url: `http://127.0.0.1:${server.port}/`, maxAttempts: 1 }),
		).resolves.toBeUndefined();
	});

	test('retries until the server starts, then resolves', async () => {
		let requestCount = 0;
		const port = 41000 + Math.floor(Math.random() * 5000);

		// Start the server after the probe has already made its first attempt,
		// proving the retry loop -- not just a lucky first hit -- is what
		// makes this pass.
		const delayedStart = (async () => {
			await Bun.sleep(50);
			requestCount++;
			return Bun.serve({ port, fetch: () => new Response('ok') });
		})();

		await expect(
			waitForHttp({ url: `http://127.0.0.1:${port}/`, maxAttempts: 5, initialDelayMs: 20 }),
		).resolves.toBeUndefined();

		const server = await delayedStart;
		expect(requestCount).toBe(1);
		server.stop(true);
	});

	test('rejects after exhausting the attempt budget against an unreachable port', async () => {
		await expect(
			waitForHttp({ url: 'http://127.0.0.1:1/', maxAttempts: 3, initialDelayMs: 5 }),
		).rejects.toThrow(/Timed out waiting for/);
	});

	test('caps at the configured maximum attempts, never looping indefinitely', async () => {
		const start = performance.now();
		await expect(
			waitForHttp({ url: 'http://127.0.0.1:1/', maxAttempts: 3, initialDelayMs: 5 }),
		).rejects.toThrow();
		// 3 attempts with a 5ms initial delay (doubling) is well under a second;
		// this is a sanity bound against an accidental unbounded loop, not a
		// tight timing assertion.
		expect(performance.now() - start).toBeLessThan(2000);
	});
});

describe('parseArguments', () => {
	test('parses valid --max-attempts and --initial-delay-ms values', () => {
		expect(
			parseArguments(['http://example.com', '--max-attempts', '7', '--initial-delay-ms', '100']),
		).toEqual({ url: 'http://example.com', maxAttempts: 7, initialDelayMs: 100 });
	});

	test('leaves maxAttempts/initialDelayMs undefined so waitForHttp applies its own defaults', () => {
		expect(parseArguments(['http://example.com'])).toEqual({
			url: 'http://example.com',
			maxAttempts: undefined,
			initialDelayMs: undefined,
		});
	});

	// Regression for a bot-reported defect: `Number.parseInt` alone turns a non-numeric,
	// negative, zero, or fractional flag value into `NaN`/an invalid number, which silently
	// disables `waitForHttp`'s retry loop entirely (`attempt <= NaN`/`attempt <= 0` is always
	// false, so it throws its "timed out" error without ever calling `fetch`). These must throw a
	// clear error at the argument-parsing boundary instead.
	test.each([
		['--max-attempts', 'abc'],
		['--max-attempts', '0'],
		['--max-attempts', '-3'],
		['--max-attempts', '5.5'],
		['--max-attempts', 'NaN'],
		['--max-attempts', 'Infinity'],
	])('rejects a non-positive-integer %s value (%s)', (flag, value) => {
		expect(() => parseArguments(['http://example.com', flag, value])).toThrow(
			/must be a positive integer/,
		);
	});

	test('rejects a non-positive-integer --initial-delay-ms value', () => {
		expect(() => parseArguments(['http://example.com', '--initial-delay-ms', 'abc'])).toThrow(
			/must be a positive integer/,
		);
	});
});
