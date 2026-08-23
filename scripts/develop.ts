import { createServer } from 'node:net';
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
	'/health/ready',
	'/metrics',
	'/mcp',
];

/**
 * The environment the dev server subprocess is spawned with. When a tunnel URL is already known,
 * `BASE_URL` is set to it — this is what makes `getBaseUrl` (`applications/web/src/lib/base-url.ts`)
 * advertise the public HTTPS tunnel origin in OAuth discovery documents, authorization redirects,
 * and the resource audience, instead of falling back to the loopback `http://localhost:3000` it
 * would otherwise infer from the plain HTTP request cloudflared forwards. `getBaseUrl` deliberately
 * ignores forwarded host/proto headers, so this environment variable is the only channel that can
 * carry the real origin to it.
 */
export function buildDevelopmentServerEnvironment(
	tunnelEnabled: boolean,
	baseEnvironment: Record<string, string | undefined>,
	tunnelUrl?: string,
): Record<string, string | undefined> {
	return {
		...baseEnvironment,
		// Only ever true when --tunnel is passed: disables the development login bypass for the
		// lifetime of this process, regardless of NODE_ENV. See `shouldEnableTunnel` above.
		PROTOKIT_TUNNEL_ACTIVE: tunnelEnabled ? 'true' : 'false',
		...(tunnelUrl ? { BASE_URL: tunnelUrl } : {}),
	};
}

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

/**
 * The subset of `Bun.spawn`'s return value every function in this file actually uses. Declared
 * as its own interface (rather than `ReturnType<typeof Bun.spawn>` directly) so `startTunnel`
 * can accept an injectable spawn function in tests — a fake process satisfying only this shape
 * (no real subprocess, no real `cloudflared` binary) is enough to exercise the URL-discovery
 * timeout path that a live `cloudflared` process cannot be reliably driven into inside a test.
 */
export interface ManagedChildProcess {
	readonly stdout: ReadableStream<Uint8Array>;
	readonly stderr: ReadableStream<Uint8Array>;
	readonly exited: Promise<number>;
	kill(): void;
}

export const childProcesses: ManagedChildProcess[] = [];

/** Test-only: clears the module-level `childProcesses` registry between test cases. */
export function resetChildProcessesForTesting(): void {
	childProcesses.length = 0;
}

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

/**
 * Round 13 review finding (P1): `startTunnel` used to run unconditionally
 * before the dev server was ever spawned. If another, unrelated process was
 * already listening on port 3000 (a leftover server, a different project),
 * cloudflared opened a public tunnel to THAT process before this script's
 * own dev server ever started; the dev server's own `bun turbo dev` then
 * failed to bind the already-occupied port, but `pollUntilReady` accepts
 * any HTTP response from `http://localhost:3000` regardless of which
 * process answered it, so the orchestration proceeded as if the tunnel
 * were exposing the intended server -- potentially leaving someone else's
 * local service publicly reachable indefinitely. Checked directly before
 * `startTunnel` runs (not after, and not by trying to "authenticate" the
 * readiness response, which the reviewer's own finding offers as an
 * alternative but which cannot distinguish "the real dev server, freshly
 * started" from "a different, unrelated service that happens to answer
 * HTTP requests the same way").
 */
export function isLocalPortInUse(port: number, hostname = '127.0.0.1'): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.once('error', () => resolve(true));
		server.once('listening', () => {
			server.close(() => resolve(false));
		});
		server.listen(port, hostname);
	});
}

/**
 * Spawns the cloudflared tunnel using the locally installed binary that `commandExists('cloudflared')`
 * already verified — not `bunx cloudflared`, which resolves and runs an unpinned npm package
 * regardless of what is actually installed on PATH, defeating the point of checking for a
 * reviewed binary first (SECRETS-001, S-12). A quick tunnel mints its public URL as soon as it
 * connects to the Cloudflare edge, independent of whether the local origin it forwards to is up
 * yet, so this runs BEFORE the dev server is spawned — the URL must be known in time to configure
 * the server's own `BASE_URL`, not merely printed after the fact.
 */
function defaultTunnelSpawn(command: readonly string[]): ManagedChildProcess {
	return Bun.spawn([...command], {
		stdout: 'pipe',
		stderr: 'pipe',
		cwd: import.meta.dirname + '/..',
	});
}

export async function startTunnel(
	options: {
		/**
		 * Overrides how the tunnel process is spawned. Test-only: production code never passes
		 * this, so it always gets the real `cloudflared` binary via `Bun.spawn`.
		 */
		spawn?: (command: readonly string[]) => ManagedChildProcess;
		/**
		 * Overrides the URL-discovery timeout in milliseconds. Test-only: production code never
		 * passes this, so it always waits the real 30 seconds.
		 */
		timeoutMilliseconds?: number;
	} = {},
): Promise<{ process: ManagedChildProcess; url: string }> {
	const { spawn = defaultTunnelSpawn, timeoutMilliseconds = 30000 } = options;
	const tunnelPrefix = `${ANSI_MAGENTA}[tunnel]${ANSI_RESET}`;
	const tunnelProcess = spawn(['cloudflared', 'tunnel', '--url', 'http://localhost:3000']);

	// Registered immediately after spawning, before waiting on URL discovery below. Regression
	// for a bot-reported P2: if cloudflared stays alive but never prints a URL matching
	// `parseTunnelUrl` within the timeout (e.g. after an output-format change), the promise below
	// rejects and this function throws before it would otherwise have returned the process to its
	// caller. `main()`'s top-level `.catch()` handler calls `shutdown()` on any such failure, but
	// `shutdown()` can only kill what is in `childProcesses` -- a tunnel process that was spawned
	// but never registered would be orphaned, left running and forwarding port 3000 to the public
	// internet, even though the command reports that startup failed.
	childProcesses.push(tunnelProcess);

	prefixStream(tunnelProcess.stdout, tunnelPrefix);

	// Parse stderr for the tunnel URL
	let tunnelUrl: string | null = null;
	const tunnelStderrReader = tunnelProcess.stderr.getReader();
	const tunnelStderrDecoder = new TextDecoder();
	let tunnelStderrBuffer = '';

	const url = await new Promise<string>((resolve, reject) => {
		const tunnelTimeout = setTimeout(() => {
			reject(new Error('Timed out waiting for tunnel URL'));
		}, timeoutMilliseconds);

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

	return { process: tunnelProcess, url };
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

	// With --tunnel, resolve the public URL FIRST: the dev server below is spawned with BASE_URL
	// set to it, which is the only way `getBaseUrl` advertises the tunnel origin instead of
	// `http://localhost:3000` in OAuth discovery documents, authorization redirects, and the
	// resource audience (see `buildDevelopmentServerEnvironment` above).
	let resolvedTunnelUrl: string | undefined;
	if (tunnelEnabled) {
		// Refuse to open a public tunnel to whatever is already listening on
		// port 3000 -- see `isLocalPortInUse`'s doc comment.
		if (await isLocalPortInUse(3000)) {
			write(
				`${ANSI_BOLD}Error:${ANSI_RESET} Port 3000 is already in use by another process. ` +
					'Refusing to start a public tunnel to it -- stop whatever is running on port 3000 first.\n',
			);
			process.exit(1);
		}

		// `startTunnel` registers its process into `childProcesses` itself, immediately after
		// spawning -- see the comment there. No push needed here.
		const tunnel = await startTunnel();
		resolvedTunnelUrl = tunnel.url;

		const banner = [
			'',
			`${ANSI_GREEN}${ANSI_BOLD}${'='.repeat(60)}${ANSI_RESET}`,
			`${ANSI_GREEN}${ANSI_BOLD}  Tunnel URL: ${resolvedTunnelUrl}${ANSI_RESET}`,
			`${ANSI_GREEN}${ANSI_BOLD}${'='.repeat(60)}${ANSI_RESET}`,
		];
		write(banner.join('\n') + '\n');
	}

	// Spawn the dev server
	const developmentPrefix = `${ANSI_CYAN}[dev]${ANSI_RESET}`;
	const developmentProcess = Bun.spawn(['bun', 'turbo', 'dev'], {
		stdout: 'pipe',
		stderr: 'pipe',
		cwd: import.meta.dirname + '/..',
		env: buildDevelopmentServerEnvironment(tunnelEnabled, process.env, resolvedTunnelUrl),
	});

	childProcesses.push(developmentProcess);
	prefixStream(developmentProcess.stdout, developmentPrefix);
	prefixStream(developmentProcess.stderr, developmentPrefix);

	write(`${developmentPrefix} Waiting for server to be ready at http://localhost:3000...\n`);

	await pollUntilReady('http://localhost:3000');

	write(`${developmentPrefix} Server is ready!\n\n`);

	if (resolvedTunnelUrl) {
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
