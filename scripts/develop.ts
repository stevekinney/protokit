import { commandExists } from './utilities.ts';

const ANSI_CYAN = '\x1b[36m';
const ANSI_MAGENTA = '\x1b[35m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_RED = '\x1b[31m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_RESET = '\x1b[0m';

// CONFIG-001 (S-06): the tunnel is opt-in. Without `--tunnel`, this script
// only runs the local dev server — nothing here is reachable off this
// machine. `--tunnel` is what makes the server public, so it also disables
// the development login bypass for the duration of the tunnel (see
// `development-authentication-routes.ts`'s `PROTOKIT_TUNNEL_ACTIVE` check)
// regardless of `NODE_ENV`.
export function shouldEnableTunnel(argv: readonly string[]): boolean {
	return argv.includes('--tunnel');
}

export function shouldEnableInspector(argv: readonly string[]): boolean {
	return argv.includes('--inspector');
}

export function parseTunnelUrl(text: string): string | null {
	const match = text.match(/(https:\/\/[^\s]+\.trycloudflare\.com[^\s]*)/);
	return match ? match[1] : null;
}

/**
 * Every route the tunnel makes publicly reachable, printed so an operator
 * knows exactly what they are exposing before the tunnel URL is live. Kept
 * as a flat, explicit list rather than derived from `application.tsx` at
 * runtime — a tunnel exposes the whole app, and this is meant to be read by
 * a human, not machine-verified against the router.
 */
export const exposedRoutes: readonly string[] = [
	'/',
	'/auth/google/start',
	'/auth/google/callback',
	'/auth/sign-out',
	'/oauth/authorize',
	'/oauth/register',
	'/oauth/token',
	'/oauth/revoke',
	'/.well-known/oauth-authorization-server',
	'/.well-known/oauth-protected-resource',
	'/.well-known/oauth-protected-resource/mcp',
	'/health',
	'/metrics',
	'/mcp',
];

export function formatExposedRoutesBanner(tunnelUrl: string): string {
	const lines = [
		'',
		`${ANSI_YELLOW}${ANSI_BOLD}The following routes are now reachable from the public internet:${ANSI_RESET}`,
		...exposedRoutes.map((route) => `  ${tunnelUrl}${route}`),
		`${ANSI_YELLOW}/auth/dev/login is disabled for the duration of this tunnel.${ANSI_RESET}`,
		'',
	];
	return lines.join('\n');
}

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

async function main(): Promise<void> {
	const tunnelEnabled = shouldEnableTunnel(process.argv);
	const inspectorEnabled = shouldEnableInspector(process.argv);

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	if (tunnelEnabled && !commandExists('cloudflared')) {
		write(
			`${ANSI_BOLD}Error:${ANSI_RESET} cloudflared is not installed. Install it with: brew install cloudflared\n`,
		);
		process.exit(1);
	}

	write(`${ANSI_BOLD}Starting development orchestration...${ANSI_RESET}\n\n`);

	if (!tunnelEnabled) {
		write(
			`${ANSI_RED}${ANSI_BOLD}No public tunnel will be started.${ANSI_RESET} ` +
				'Pass --tunnel to expose this server on the public internet via cloudflared.\n\n',
		);
	}

	// Spawn the dev server
	const developmentPrefix = `${ANSI_CYAN}[dev]${ANSI_RESET}`;
	const developmentProcess = Bun.spawn(['bun', 'turbo', 'dev'], {
		stdout: 'pipe',
		stderr: 'pipe',
		cwd: import.meta.dirname + '/..',
		env: {
			...process.env,
			// Only ever true when --tunnel is passed: disables the
			// development login bypass for the lifetime of this process,
			// regardless of NODE_ENV. See `shouldEnableTunnel` above.
			PROTOKIT_TUNNEL_ACTIVE: tunnelEnabled ? 'true' : 'false',
		},
	});

	childProcesses.push(developmentProcess);
	prefixStream(developmentProcess.stdout, developmentPrefix);
	prefixStream(developmentProcess.stderr, developmentPrefix);

	write(`${developmentPrefix} Waiting for server to be ready at http://localhost:3000...\n`);

	await pollUntilReady('http://localhost:3000');

	write(`${developmentPrefix} Server is ready!\n\n`);

	if (tunnelEnabled) {
		// Spawn the cloudflared tunnel
		const tunnelPrefix = `${ANSI_MAGENTA}[tunnel]${ANSI_RESET}`;
		const tunnelProcess = Bun.spawn(
			['bunx', 'cloudflared', 'tunnel', '--url', 'http://localhost:3000'],
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
		];

		write(banner.join('\n') + '\n');
		write(formatExposedRoutesBanner(resolvedTunnelUrl));
	}

	// Optionally spawn the MCP inspector
	if (inspectorEnabled) {
		const inspectorPrefix = `${ANSI_YELLOW}[inspector]${ANSI_RESET}`;
		// Pinned to a reviewed version (SUPPLY-001): an unpinned `bunx` invocation
		// resolves whatever the registry currently tags `latest`, which is not a
		// reviewable supply-chain input.
		const inspectorProcess = Bun.spawn(['bunx', '@modelcontextprotocol/inspector@2.3.0'], {
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

if (import.meta.main) {
	main().catch((error) => {
		write(`${ANSI_BOLD}Fatal error:${ANSI_RESET} ${error.message}\n`);
		shutdown();
	});
}
