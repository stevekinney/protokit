import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isAddressInCidr } from '@web/lib/trusted-proxy';

/**
 * `OPS-001`: pure, host-agnostic checks shared by the deployed-envelope
 * harnesses (`deployed-smoke.ts`, `deployed-streaming.ts`, `deployed-oauth.ts`).
 *
 * Kept dependency-free of `@web/env` and any application module -- these
 * functions describe what a *live, public* deployment must look like from
 * the outside, not this repository's own local test configuration. Each one
 * is proven, in `deployed-validation-support.test.ts`, to discriminate in
 * both directions: it accepts a genuinely correct case and rejects a
 * deliberately wrong one, not merely "does not throw" against whatever this
 * sandbox happens to be able to reach.
 */

const PRIVATE_IPV4_RANGES: ReadonlyArray<{ start: number; end: number }> = [
	// 0.0.0.0/8
	{ start: ipv4ToInt('0.0.0.0'), end: ipv4ToInt('0.255.255.255') },
	// 10.0.0.0/8
	{ start: ipv4ToInt('10.0.0.0'), end: ipv4ToInt('10.255.255.255') },
	// 100.64.0.0/10 (carrier-grade NAT)
	{ start: ipv4ToInt('100.64.0.0'), end: ipv4ToInt('100.127.255.255') },
	// 127.0.0.0/8 (loopback)
	{ start: ipv4ToInt('127.0.0.0'), end: ipv4ToInt('127.255.255.255') },
	// 169.254.0.0/16 (link-local)
	{ start: ipv4ToInt('169.254.0.0'), end: ipv4ToInt('169.254.255.255') },
	// 172.16.0.0/12
	{ start: ipv4ToInt('172.16.0.0'), end: ipv4ToInt('172.31.255.255') },
	// 192.168.0.0/16
	{ start: ipv4ToInt('192.168.0.0'), end: ipv4ToInt('192.168.255.255') },
	// 198.18.0.0/15 (benchmarking)
	{ start: ipv4ToInt('198.18.0.0'), end: ipv4ToInt('198.19.255.255') },
	// 240.0.0.0/4 (reserved) + 255.255.255.255 (broadcast)
	{ start: ipv4ToInt('240.0.0.0'), end: ipv4ToInt('255.255.255.255') },
];

function ipv4ToInt(address: string): number {
	const parts = address.split('.').map(Number);
	return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

export function isPubliclyRoutableIpv4(address: string): boolean {
	if (isIP(address) !== 4) return false;
	const value = ipv4ToInt(address);
	return !PRIVATE_IPV4_RANGES.some((range) => value >= range.start && value <= range.end);
}

// A textual-prefix check on link-local addresses (`startsWith('fe80:')`)
// only matches the single hextet `fe80`, but `fe80::/10` covers every
// address whose first hextet is `fe80`-`febf` (`fe90::1`, `fea0::1`,
// `febf::1`, ...) -- a real link-local address outside that one literal
// prefix would slip past a textual check and be reported as publicly
// routable. `isAddressInCidr` (shared with the SSRF blocklist in
// `client-metadata-documents.ts` and the trusted-proxy check) parses the
// address and masks it against the actual prefix length instead.
const NON_PUBLIC_IPV6_CIDRS = [
	'::1/128', // loopback
	'::/128', // unspecified
	'::ffff:0:0/96', // IPv4-mapped IPv6
	'64:ff9b::/96', // NAT64 well-known prefix
	'100::/64', // discard-only
	'2001:db8::/32', // documentation
	'fc00::/7', // unique local
	'fe80::/10', // link-local (fe80:: through febf:ffff:...)
	'ff00::/8', // multicast
] as const;

export function isPubliclyRoutableIpv6(address: string): boolean {
	if (isIP(address) !== 6) return false;
	return !NON_PUBLIC_IPV6_CIDRS.some((cidr) => isAddressInCidr(address, cidr));
}

export interface DnsResolutionResult {
	readonly hostname: string;
	readonly addresses: ReadonlyArray<{ address: string; family: 4 | 6 }>;
	readonly problems: ReadonlyArray<string>;
}

/**
 * Resolves `hostname` and asserts every returned address is publicly
 * routable -- the acceptance criterion's "permitted public address," not a
 * private, loopback, link-local, or carrier-NAT address a client outside
 * the deployment network could never reach. Takes a `resolveHostname`
 * dependency (defaults to `dns.lookup`) purely so the test file can inject
 * a fixture without a real DNS round trip.
 */
export async function checkPublicDnsResolution(
	hostname: string,
	resolveHostname: (
		name: string,
	) => Promise<ReadonlyArray<{ address: string; family: number }>> = async (name) => {
		const results = await lookup(name, { all: true, verbatim: true });
		return results;
	},
): Promise<DnsResolutionResult> {
	const problems: string[] = [];
	let resolved: ReadonlyArray<{ address: string; family: number }>;

	try {
		resolved = await resolveHostname(hostname);
	} catch (error) {
		return {
			hostname,
			addresses: [],
			problems: [
				`DNS resolution failed for ${hostname}: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}

	if (resolved.length === 0) {
		problems.push(`DNS resolution for ${hostname} returned no addresses`);
	}

	const addresses: Array<{ address: string; family: 4 | 6 }> = [];
	for (const entry of resolved) {
		const family = entry.family === 6 ? 6 : 4;
		addresses.push({ address: entry.address, family });
		const isPublic =
			family === 4 ? isPubliclyRoutableIpv4(entry.address) : isPubliclyRoutableIpv6(entry.address);
		if (!isPublic) {
			problems.push(`${hostname} resolved to non-public address ${entry.address}`);
		}
	}

	return { hostname, addresses, problems };
}

export interface CrossHostRedirectResult {
	readonly path: string;
	readonly requestedUrl: string;
	readonly problem: string | null;
}

/**
 * Fetches `path` under `baseUrl` with `redirect: 'manual'` and flags any
 * 3xx response whose `Location` resolves to a different origin. Clients on
 * the compatibility contract's own list (Claude Code, Codex, ChatGPT) drop
 * the `Authorization` header across a cross-origin redirect, so a canonical
 * discovery/OAuth/MCP URL that bounces to another host silently breaks
 * authentication for exactly the callers this server needs to work with.
 * Same-origin redirects (e.g. a trailing-slash normalization) are allowed.
 */
export async function checkNoCrossHostRedirect(
	baseUrl: string,
	path: string,
	fetchImplementation: typeof fetch = fetch,
): Promise<CrossHostRedirectResult> {
	const requestedUrl = new URL(path, baseUrl).toString();
	const requestOrigin = new URL(baseUrl).origin;

	let response: Response;
	try {
		response = await fetchImplementation(requestedUrl, {
			redirect: 'manual',
			signal: AbortSignal.timeout(10_000),
		});
	} catch (error) {
		return {
			path,
			requestedUrl,
			problem: `request to ${requestedUrl} failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	if (response.status < 300 || response.status >= 400) {
		return { path, requestedUrl, problem: null };
	}

	const location = response.headers.get('location');
	if (!location) {
		return {
			path,
			requestedUrl,
			problem: `${requestedUrl} responded ${response.status} with no Location header`,
		};
	}

	const redirectOrigin = new URL(location, requestedUrl).origin;
	if (redirectOrigin !== requestOrigin) {
		return {
			path,
			requestedUrl,
			problem: `${requestedUrl} redirected (${response.status}) to a different origin: ${redirectOrigin}`,
		};
	}

	return { path, requestedUrl, problem: null };
}

export interface StreamChunkTiming {
	readonly receivedAtMs: number;
}

/**
 * Given the arrival timestamps of chunks the server flushed with at least
 * `minimumServerGapMs` of deliberate delay between them, decides whether
 * the response was streamed to this client as it was produced (unbuffered)
 * or held and delivered all at once by an intermediary (buffered).
 *
 * Pure and dependency-free so it can be exercised directly against
 * fabricated timestamp fixtures -- both the "genuinely streamed" and
 * "proxy buffered the whole response" shapes -- without needing a real
 * network round trip in the unit test.
 */
export function detectStreamBuffering(
	chunkTimings: ReadonlyArray<StreamChunkTiming>,
	minimumServerGapMs: number,
): { buffered: boolean; observedGapMs: number | null; reason: string } {
	if (chunkTimings.length < 2) {
		return {
			buffered: true,
			observedGapMs: null,
			reason: `expected at least 2 chunks to measure a gap between, received ${chunkTimings.length}`,
		};
	}

	const gaps: number[] = [];
	for (let index = 1; index < chunkTimings.length; index++) {
		gaps.push(chunkTimings[index]!.receivedAtMs - chunkTimings[index - 1]!.receivedAtMs);
	}
	const largestGap = Math.max(...gaps);

	// A genuinely unbuffered stream reproduces most of the server's
	// deliberate delay between chunks. A buffering intermediary collapses
	// every chunk into (approximately) one delivery, so the largest
	// observed gap collapses toward zero regardless of how long the server
	// actually waited between writes.
	const buffered = largestGap < minimumServerGapMs * 0.5;

	return {
		buffered,
		observedGapMs: largestGap,
		reason: buffered
			? `largest inter-chunk gap (${largestGap}ms) is far below the server's own ${minimumServerGapMs}ms delay -- an intermediary held the response and delivered it as one burst`
			: `largest inter-chunk gap (${largestGap}ms) tracks the server's ${minimumServerGapMs}ms delay -- chunks arrived as the server produced them`,
	};
}
