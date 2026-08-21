#!/usr/bin/env bun
/**
 * `INTEROP-001`: a bounded HTTP readiness probe, replacing fixed startup
 * sleeps (e.g. the old `sleep 4` before the continuous-integration
 * conformance step) with a real check that fails fast instead of racing a
 * server that hasn't finished booting.
 *
 * Capped at five attempts with exponential backoff, matching the polling
 * cap `test-container-smoke.ts`'s `waitForCondition` already established
 * and this repository's standing "cap at five attempts, never loop
 * indefinitely" rule.
 *
 * Usage:
 *   bun scripts/wait-for-http.ts <url> [--max-attempts 5] [--initial-delay-ms 250]
 *
 * Exits 0 once a response is received (any HTTP status counts as "the
 * server answered" — this probes reachability, not application-level
 * health). Exits 1 after the attempt budget is exhausted.
 */

export interface WaitForHttpOptions {
	url: string;
	maxAttempts?: number;
	initialDelayMs?: number;
}

export async function waitForHttp({
	url,
	maxAttempts = 5,
	initialDelayMs = 250,
}: WaitForHttpOptions): Promise<void> {
	let delayMs = initialDelayMs;
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			await fetch(url, { signal: AbortSignal.timeout(5000) });
			return;
		} catch (error) {
			lastError = error;
			if (attempt === maxAttempts) break;
			await Bun.sleep(delayMs);
			delayMs *= 2;
		}
	}

	throw new Error(
		`Timed out waiting for ${url} to accept connections after ${maxAttempts} attempts: ${String(lastError)}`,
	);
}

function parseArguments(argv: string[]): WaitForHttpOptions {
	const url = argv[0];
	if (!url) {
		throw new Error(
			'Usage: bun scripts/wait-for-http.ts <url> [--max-attempts N] [--initial-delay-ms N]',
		);
	}

	let maxAttempts: number | undefined;
	let initialDelayMs: number | undefined;

	for (let index = 1; index < argv.length; index++) {
		const flag = argv[index];
		const value = argv[index + 1];
		if (flag === '--max-attempts' && value) {
			maxAttempts = Number.parseInt(value, 10);
			index++;
		} else if (flag === '--initial-delay-ms' && value) {
			initialDelayMs = Number.parseInt(value, 10);
			index++;
		}
	}

	return { url, maxAttempts, initialDelayMs };
}

if (import.meta.main) {
	const options = parseArguments(process.argv.slice(2));
	console.log(
		`[wait-for-http] waiting for ${options.url} (max ${options.maxAttempts ?? 5} attempts)`,
	);
	try {
		await waitForHttp(options);
		console.log(`[wait-for-http] ${options.url} is reachable`);
	} catch (error) {
		console.error(`[wait-for-http] ${(error as Error).message}`);
		process.exit(1);
	}
}
