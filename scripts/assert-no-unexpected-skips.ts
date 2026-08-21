#!/usr/bin/env bun
/**
 * `INTEROP-001` acceptance: "Continuous integration ... fails on any
 * unexpected skipped test." This branch's own history (`PROGRESS.local.md`)
 * documents three separate incidents where a suite read green only because
 * the test that mattered never ran — a human skimming CI output missed it
 * every time. This makes that mechanical instead of a habit to remember.
 *
 * Runs the given command, streams its output live (so a human watching CI
 * still sees everything as it happens), then parses the captured output for
 * `bun:test`'s own `N skip` summary line. `bun:test` only prints that line
 * when the count is nonzero (verified directly — a run with zero skipped
 * tests omits the line entirely), so this sums every occurrence across every
 * package `bun turbo test` fans out to and fails loudly on anything above
 * zero, in addition to propagating the wrapped command's own exit code.
 *
 * Usage:
 *   bun scripts/assert-no-unexpected-skips.ts -- <command> [args...]
 */

function parseCommand(argv: string[]): string[] {
	const separatorIndex = argv.indexOf('--');
	const command = separatorIndex === -1 ? argv : argv.slice(separatorIndex + 1);
	if (command.length === 0) {
		throw new Error('Usage: bun scripts/assert-no-unexpected-skips.ts -- <command> [args...]');
	}
	return command;
}

export function countSkippedTests(output: string): number {
	const matches = output.matchAll(/(\d+)\s+skip\b/g);
	let total = 0;
	for (const match of matches) {
		total += Number.parseInt(match[1]!, 10);
	}
	return total;
}

if (import.meta.main) {
	const command = parseCommand(process.argv.slice(2));

	const chunks: Buffer[] = [];
	const child = Bun.spawn(command, {
		stdout: 'pipe',
		stderr: 'pipe',
		stdin: 'inherit',
	});

	async function pump(stream: ReadableStream<Uint8Array>, sink: NodeJS.WriteStream): Promise<void> {
		for await (const chunk of stream) {
			chunks.push(Buffer.from(chunk));
			sink.write(chunk);
		}
	}

	await Promise.all([pump(child.stdout, process.stdout), pump(child.stderr, process.stderr)]);
	const exitCode = await child.exited;

	const output = Buffer.concat(chunks).toString('utf-8');
	const skippedCount = countSkippedTests(output);

	if (skippedCount > 0) {
		console.error(
			`\n[assert-no-unexpected-skips] ${skippedCount} test(s) were skipped. An unexpected skip is a failure, not a pass -- see PROGRESS.local.md for why this branch treats it that way.`,
		);
		process.exit(1);
	}

	if (exitCode !== 0) {
		process.exit(exitCode);
	}
}
