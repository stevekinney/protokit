import { describe, expect, it, mock } from 'bun:test';

/**
 * `CopyButton`'s `handleClick` (the `navigator.clipboard.writeText` call,
 * `setCopied(true)`, and the 2s `setTimeout(() => setCopied(false), ...)`)
 * only runs on a real click. This repo has no DOM test setup (no
 * happy-dom/jsdom, no `@testing-library/*`), so `renderToStaticMarkup`
 * (used in `copy-button.test.tsx`) produces HTML only and never invokes
 * `onClick`.
 *
 * Rather than fake coverage with an unasserted import, this mocks `react`'s
 * `useState` with a plain, non-reactive recorder so `CopyButton` can be
 * called directly as an ordinary function (no fiber/dispatcher required)
 * and its real `onClick` closure extracted and invoked. This runs in its
 * own file because the suite runs with `--isolate` (one process per test
 * file), so mocking `react` here can't leak into `copy-button.test.tsx`'s
 * real `react-dom/server` rendering.
 *
 * Call tracking is done with plain arrays pushed to by hand -- not `mock()`'s
 * own `.mock.calls`/`toHaveBeenCalledWith` -- matching this codebase's
 * established convention elsewhere (e.g. `mcp-routes.test.ts`'s
 * `hashCredentialCalls`) for inspecting what a spy was called with.
 */
const stateCalls: unknown[] = [];
const setStateCalls: unknown[][] = [];
function setStateSpy(...arguments_: unknown[]): void {
	setStateCalls.push(arguments_);
}

const actualReact = await import('react');

mock.module('react', () => {
	return {
		...actualReact,
		useState: (initial: unknown) => {
			stateCalls.push(initial);
			return [initial, setStateSpy];
		},
	};
});

const { CopyButton } = await import('@web/components/copy-button');

describe('CopyButton click behavior', () => {
	it('copies the provided text to the clipboard on click', async () => {
		const writeTextCalls: unknown[][] = [];
		function writeText(...arguments_: unknown[]): Promise<void> {
			writeTextCalls.push(arguments_);
			return Promise.resolve();
		}
		Object.defineProperty(globalThis.navigator, 'clipboard', {
			value: { writeText },
			configurable: true,
		});

		const element = CopyButton({ text: 'https://example.com/mcp' }) as unknown as {
			props: { onClick: () => void };
		};

		expect(stateCalls).toContain(false);

		element.props.onClick();

		// writeText is called synchronously inside handleClick, before the
		// promise resolves.
		expect(writeTextCalls).toEqual([['https://example.com/mcp']]);

		// Let the `.then(() => setCopied(true))` microtask run.
		await Promise.resolve();
		await Promise.resolve();

		expect(setStateCalls.at(-1)).toEqual([true]);
	});

	it('resets copied state back to false after the timeout elapses', async () => {
		setStateCalls.length = 0;
		const writeText = mock(() => Promise.resolve());
		Object.defineProperty(globalThis.navigator, 'clipboard', {
			value: { writeText },
			configurable: true,
		});

		const originalSetTimeout = globalThis.setTimeout;
		let capturedCallback: (() => void) | undefined;
		let capturedDelay: number | undefined;
		// @ts-expect-error -- intentionally narrowing setTimeout's signature for this spy
		globalThis.setTimeout = (callback: () => void, delay?: number) => {
			capturedCallback = callback;
			capturedDelay = delay;
			return 0 as unknown as ReturnType<typeof setTimeout>;
		};

		try {
			const element = CopyButton({ text: 'reset-me' }) as unknown as {
				props: { onClick: () => void };
			};
			element.props.onClick();

			await Promise.resolve();
			await Promise.resolve();

			expect(setStateCalls.at(-1)).toEqual([true]);
			expect(capturedDelay).toBe(2000);
			expect(capturedCallback).toBeDefined();

			capturedCallback?.();
			expect(setStateCalls.at(-1)).toEqual([false]);
		} finally {
			globalThis.setTimeout = originalSetTimeout;
		}
	});
});
