import { commandExists } from './utilities.ts';

const ANSI_CYAN = '\x1b[36m';
const ANSI_MAGENTA = '\x1b[35m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_RESET = '\x1b[0m';

const inspectorEnabled = process.argv.includes('--inspector');
const childProcesses: Array<ReturnType<typeof Bun.spawn>> = [];

function write(message: string): void {
	process.stdout.write(message);
}

function prefixStream(stream: ReadableStream<Uint8Array>, prefix: string): void {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	function read(): void {
		reader.read().then(({ done, value }) => {
			if (done) return;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (line.length > 0) {
					write(`${prefix} ${line}\n`);
				}
			}

			read();
		});
	}

	read();
}

function shutdown(): void {
	write('\nShutting down all processes...\n');

	for (const childProcess of childProcesses) {
		try {
			childProcess.kill();
		} catch {
			// Process may already be dead
		}
	}

	process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function pollUntilReady(
	url: string,
	{ interval = 1000, timeout = 60000 }: { interval?: number; timeout?: number } = {},
): Promise<void> {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		try {
			await fetch(url);
			return;
		} catch {
			await Bun.sleep(interval);
		}
	}

	throw new Error(`Timed out waiting for ${url} to become ready`);
}

function parseTunnelUrl(text: string): string | null {
	const match = text.match(/(https:\/\/[^\s]+\.trycloudflare\.com[^\s]*)/);
	return match ? match[1] : null;
}

async function main(): Promise<void> {
	if (!commandExists('cloudflared')) {
		write(
			`${ANSI_BOLD}Error:${ANSI_RESET} cloudflared is not installed. Install it with: brew install cloudflared\n`,
		);
		process.exit(1);
	}

	write(`${ANSI_BOLD}Starting development orchestration...${ANSI_RESET}\n\n`);

	// Spawn the dev server
	const developmentPrefix = `${ANSI_CYAN}[dev]${ANSI_RESET}`;
	const developmentProcess = Bun.spawn(['bun', 'turbo', 'dev'], {
		stdout: 'pipe',
		stderr: 'pipe',
		cwd: import.meta.dirname + '/..',
	});

	childProcesses.push(developmentProcess);
	prefixStream(developmentProcess.stdout, developmentPrefix);
	prefixStream(developmentProcess.stderr, developmentPrefix);

	write(`${developmentPrefix} Waiting for server to be ready at http://localhost:3000...\n`);

	await pollUntilReady('http://localhost:3000');

	write(`${developmentPrefix} Server is ready!\n\n`);

	// Spawn the cloudflared tunnel
	const tunnelPrefix = `${ANSI_MAGENTA}[tunnel]${ANSI_RESET}`;
	const tunnelProcess = Bun.spawn(
		['bunx', 'cloudflared', 'tunnel', '--url', 'http://localhost:3000/mcp'],
		{
			stdout: 'pipe',
			stderr: 'pipe',
			cwd: import.meta.dirname + '/..',
		},
	);

	childProcesses.push(tunnelProcess);
	prefixStream(tunnelProcess.stdout, tunnelPrefix);

	// Parse stderr for the tunnel URL
	let tunnelUrl: string | null = null;
	const tunnelStderrReader = tunnelProcess.stderr.getReader();
	const tunnelStderrDecoder = new TextDecoder();
	let tunnelStderrBuffer = '';

	const tunnelUrlPromise = new Promise<string>((resolve, reject) => {
		const tunnelTimeout = setTimeout(() => {
			reject(new Error('Timed out waiting for tunnel URL'));
		}, 30000);

		function readTunnelStderr(): void {
			tunnelStderrReader.read().then(({ done, value }) => {
				if (done) return;

				tunnelStderrBuffer += tunnelStderrDecoder.decode(value, { stream: true });
				const lines = tunnelStderrBuffer.split('\n');
				tunnelStderrBuffer = lines.pop() ?? '';

				for (const line of lines) {
					if (line.length > 0) {
						write(`${tunnelPrefix} ${line}\n`);
					}

					if (!tunnelUrl) {
						const extractedUrl = parseTunnelUrl(line);
						if (extractedUrl) {
							tunnelUrl = extractedUrl;
							clearTimeout(tunnelTimeout);
							resolve(extractedUrl);
						}
					}
				}

				readTunnelStderr();
			});
		}

		readTunnelStderr();
	});

	const resolvedTunnelUrl = await tunnelUrlPromise;

	// Print highlighted banner
	const banner = [
		'',
		`${ANSI_GREEN}${ANSI_BOLD}${'='.repeat(60)}${ANSI_RESET}`,
		`${ANSI_GREEN}${ANSI_BOLD}  Tunnel URL: ${resolvedTunnelUrl}${ANSI_RESET}`,
		`${ANSI_GREEN}${ANSI_BOLD}${'='.repeat(60)}${ANSI_RESET}`,
		'',
	];

	write(banner.join('\n') + '\n');

	// Optionally spawn the MCP inspector
	if (inspectorEnabled) {
		const inspectorPrefix = `${ANSI_YELLOW}[inspector]${ANSI_RESET}`;
		const inspectorProcess = Bun.spawn(['bunx', '@modelcontextprotocol/inspector'], {
			stdout: 'pipe',
			stderr: 'pipe',
			cwd: import.meta.dirname + '/..',
		});

		childProcesses.push(inspectorProcess);
		prefixStream(inspectorProcess.stdout, inspectorPrefix);
		prefixStream(inspectorProcess.stderr, inspectorPrefix);

		write(`${inspectorPrefix} MCP Inspector started\n`);
	}

	// Keep the process alive
	await Promise.all(childProcesses.map((childProcess) => childProcess.exited));
}

main().catch((error) => {
	write(`${ANSI_BOLD}Fatal error:${ANSI_RESET} ${error.message}\n`);
	shutdown();
});
