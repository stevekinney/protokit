import { lookup as defaultDnsLookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';
import { z } from 'zod';
import { logger } from '@template/mcp/logger';
import { isAddressInCidr } from '@web/lib/trusted-proxy';
import { isValidClientName } from '@web/lib/client-name-validation';
import { isValidRedirectUri } from '@web/lib/validate-redirect-uri';
import { isExactContentType } from '@web/lib/exact-content-type';
import { withDeadline } from '@web/lib/with-deadline';
import {
	cimdCacheMaxEntries,
	cimdCacheTtlMs,
	cimdFetchTimeoutMs,
	cimdMaxResponseBytes,
	oauthMaxClientNameLength,
	oauthMaxGrantTypeCount,
	oauthMaxRedirectUriCount,
	oauthMaxRedirectUriLength,
	oauthMaxResponseTypeCount,
} from '@web/lib/request-limits';

/**
 * OAUTH-002 / MCP `2026-07-28`: Client ID Metadata Documents (CIMD) let a
 * client use an HTTPS URL as its `client_id`. When this server sees one, it
 * fetches a JSON document from that exact URL and treats the document as
 * the client's registration metadata, instead of requiring a prior
 * `POST /oauth/register` call. This file owns fetching, validating, and
 * caching that document. It never touches the database — `oauth-routes.ts`
 * upserts a `oauthClients` row from the validated result so downstream
 * authorization-code and token-grant lookups need no CIMD-specific branch.
 *
 * draft-ietf-oauth-client-id-metadata-document-00 and the MCP spec's
 * "Authorization Server Abuse Protection" section both flag this as an
 * SSRF surface: the authorization server is making a request to a URL an
 * untrusted party supplied. `assertHostnameIsPubliclyRoutable` is the
 * mitigation for that half. It is a resolve-then-connect check, not
 * connection-level IP pinning — `fetchImpl` still does its own DNS
 * resolution when it actually connects, so a narrow DNS-rebinding window
 * exists between the two lookups. The backstop for that window is that
 * this fetch is HTTPS-only with normal certificate validation: rebinding
 * the name to an internal host does not produce a certificate that
 * validates for that host's hostname, so the request fails at the TLS
 * handshake rather than silently reaching the internal target.
 */

// -- SSRF: block private, loopback, link-local, and other non-public ranges --
//
// Covers both the literal-IP case (`https://169.254.169.254/doc.json`) and
// the resolved-hostname case (a public hostname whose A/AAAA record points
// at one of these ranges) via the same check.
const blockedIpCidrs = [
	'0.0.0.0/8', // "this network"
	'10.0.0.0/8', // RFC 1918 private
	'100.64.0.0/10', // carrier-grade NAT
	'127.0.0.0/8', // loopback
	'169.254.0.0/16', // link-local — includes the 169.254.169.254 cloud metadata address
	'172.16.0.0/12', // RFC 1918 private
	'192.0.0.0/24', // IETF protocol assignments
	'192.0.2.0/24', // documentation (TEST-NET-1)
	'192.88.99.0/24', // 6to4 relay anycast
	'192.168.0.0/16', // RFC 1918 private
	'198.18.0.0/15', // benchmarking
	'198.51.100.0/24', // documentation (TEST-NET-2)
	'203.0.113.0/24', // documentation (TEST-NET-3)
	'224.0.0.0/4', // multicast
	'240.0.0.0/4', // reserved
	'255.255.255.255/32', // limited broadcast
	'::1/128', // loopback
	'::/128', // unspecified
	'64:ff9b::/96', // NAT64 well-known prefix
	'::ffff:0:0/96', // IPv4-mapped IPv6 (the IPv4 blocklist above already covers the mapped address itself)
	'100::/64', // discard-only
	'2001:db8::/32', // documentation
	'fc00::/7', // unique local
	'fe80::/10', // link-local
	'ff00::/8', // multicast
] as const;

function isBlockedIpAddress(address: string): boolean {
	return blockedIpCidrs.some((cidr) => isAddressInCidr(address, cidr));
}

/**
 * `URL.hostname` keeps the bracket delimiters for an IPv6 literal
 * (`https://[::1]/x` -> hostname `"[::1]"`), because brackets are what
 * distinguish an IPv6 literal's colons from a URL's own `host:port`
 * delimiter. `node:net`'s `isIPv6` and `isAddressInCidr`'s parser both
 * expect the bare address, so a bracketed literal matches neither the
 * IP-family check nor the blocklist -- it falls through to `dns.lookup`,
 * which fails with `ENOTFOUND` on a literal address, rejecting every
 * IPv6-literal Client ID Metadata Document regardless of whether it is
 * public or blocked. Stripping the brackets here (and only here, for the
 * routability check) fixes that without touching the URL used for the
 * actual HTTPS request, which must keep its bracket syntax to remain a
 * valid URL.
 */
function stripIpv6Brackets(hostname: string): string {
	if (hostname.startsWith('[') && hostname.endsWith(']')) {
		return hostname.slice(1, -1);
	}
	return hostname;
}

export class ClientMetadataDocumentFetchError extends Error {
	constructor(public readonly reason: string) {
		super(reason);
		this.name = 'ClientMetadataDocumentFetchError';
	}
}

/**
 * A narrowed, single-shape view of `node:dns/promises`' heavily overloaded
 * `lookup` (whose return type depends on which options object is passed) —
 * this file only ever calls it one way, so dependency injection for tests
 * gets one simple shape to implement instead of every overload.
 */
export type DnsLookupAllFunction = (
	hostname: string,
	options: { all: true; verbatim: true },
) => Promise<{ address: string; family: number }[]>;

const lookupAll: DnsLookupAllFunction = (hostname, options) => defaultDnsLookup(hostname, options);

export type ClientMetadataDocumentFetchDependencies = {
	fetchImpl?: typeof fetch;
	lookupImpl?: DnsLookupAllFunction;
	now?: () => number;
	/**
	 * Deadline for the DNS-resolution phase of `assertHostnameIsPubliclyRoutable`, in
	 * milliseconds. Defaults to `cimdFetchTimeoutMs` -- the same bounded-fetch budget already
	 * applied to the HTTP fetch that follows, so the whole preflight (resolve + connect) has one
	 * consistent time budget rather than an unbounded resolve step ahead of a bounded fetch.
	 * Overridable so tests can exercise the timeout path without a 5-second wait.
	 */
	dnsTimeoutMs?: number;
};

// `node:dns/promises`' `lookup` has no built-in deadline: a resolver outage or an
// attacker-controlled slow-responding DNS server can hold this await open indefinitely, which
// would tie up the handler well past `cimdFetchTimeoutMs` even though that constant is applied to
// the fetch that follows. `withDeadline` races the lookup against a timer so the DNS phase is
// bounded exactly like the fetch phase.
//
// `withDeadline` only ever walks away from the lookup -- it cannot cancel the underlying
// `dns.lookup` call (Node's `getaddrinfo`, serviced by the libuv threadpool). A hostname whose DNS
// resolution never completes (a black-holed authoritative server, for example) therefore leaves
// that lookup running for its own resolver-level timeout regardless of what this file does. Two
// bounds below keep repeated authorization requests from turning that into an ever-growing set of
// outstanding resolver operations:
//
//  - `inFlightDnsLookupsByHostname` coalesces concurrent lookups for the *same* hostname into one
//    underlying `dns.lookup` call. This is a pure in-flight dedupe, not a result cache: the entry
//    is removed the instant the lookup settles (success or failure), so it never serves a result
//    beyond that one lookup's own lifetime and adds no DNS-rebinding or staleness exposure. Do not
//    turn this into a TTL'd result cache -- caching a failed or successful resolution here would
//    let a since-rotated or rebound record keep being trusted after the record itself changed.
//  - `dnsLookupConcurrencyLimit` bounds how many *distinct*-hostname lookups may be outstanding at
//    once. A request that arrives once the limit is already saturated is rejected immediately
//    (mapped to the same `dns_resolution_failed` outcome as any other DNS failure below, which
//    `fetchClientIdMetadataDocument` turns into "no usable document" for the caller) rather than
//    queued -- an unbounded queue would just be the same unbounded resource wearing a different
//    hat.
const dnsLookupConcurrencyLimit = 16;
let outstandingDnsLookupCount = 0;
const inFlightDnsLookupsByHostname = new Map<
	string,
	Promise<{ address: string; family: number }[]>
>();

class DnsLookupConcurrencyLimitExceededError extends Error {
	constructor() {
		super('DNS lookup concurrency limit exceeded');
		this.name = 'DnsLookupConcurrencyLimitExceededError';
	}
}

function boundedCoalescedLookup(
	hostname: string,
	lookupImpl: DnsLookupAllFunction,
): Promise<{ address: string; family: number }[]> {
	const inFlight = inFlightDnsLookupsByHostname.get(hostname);
	if (inFlight) return inFlight;

	if (outstandingDnsLookupCount >= dnsLookupConcurrencyLimit) {
		return Promise.reject(new DnsLookupConcurrencyLimitExceededError());
	}

	outstandingDnsLookupCount += 1;
	const lookupPromise = lookupImpl(hostname, { all: true, verbatim: true }).finally(() => {
		outstandingDnsLookupCount -= 1;
		inFlightDnsLookupsByHostname.delete(hostname);
	});

	inFlightDnsLookupsByHostname.set(hostname, lookupPromise);
	return lookupPromise;
}

async function assertHostnameIsPubliclyRoutable(
	hostname: string,
	lookupImpl: DnsLookupAllFunction,
	dnsTimeoutMs: number,
): Promise<void> {
	if (isIPv4(hostname) || isIPv6(hostname)) {
		if (isBlockedIpAddress(hostname)) {
			throw new ClientMetadataDocumentFetchError('blocked_address');
		}
		return;
	}

	let records: { address: string }[];
	try {
		records = await withDeadline(boundedCoalescedLookup(hostname, lookupImpl), dnsTimeoutMs);
	} catch {
		throw new ClientMetadataDocumentFetchError('dns_resolution_failed');
	}

	if (records.length === 0) {
		throw new ClientMetadataDocumentFetchError('dns_resolution_failed');
	}

	for (const record of records) {
		if (isBlockedIpAddress(record.address)) {
			throw new ClientMetadataDocumentFetchError('blocked_address');
		}
	}
}

/**
 * A `client_id` is a Client ID Metadata Document identifier only if it is
 * an HTTPS URL with a non-root path component (the MCP spec's own
 * requirement, matching the CIMD draft: `https://example.com/client.json`,
 * never bare `https://example.com`), no fragment, and no embedded userinfo.
 * A DCR `client_id` is always a `randomUUID()`, so this never collides with
 * one.
 */
export function isClientIdMetadataDocumentUrl(clientId: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(clientId);
	} catch {
		return false;
	}

	if (parsed.protocol !== 'https:') return false;
	if (parsed.hash !== '' || parsed.username !== '' || parsed.password !== '') return false;
	if (parsed.pathname === '' || parsed.pathname === '/') return false;

	return true;
}

const applicationTypes = ['web', 'native'] as const;

/**
 * `application_type` is DCR/OIDC vocabulary (SEP-837), not part of the
 * CIMD draft itself, but a document may still declare it and this server
 * honors the same web/native redirect-URI distinction either way: a
 * `web` document's `redirect_uris` must all be HTTPS (no loopback).
 */
function documentRedirectUrisMatchApplicationType(
	redirectUris: string[],
	applicationType: (typeof applicationTypes)[number] | undefined,
): boolean {
	if (applicationType !== 'web') return true;
	return redirectUris.every((uri) => new URL(uri).protocol === 'https:');
}

const clientMetadataDocumentSchema = z
	.object({
		client_id: z.string().url(),
		client_name: z
			.string()
			.min(1)
			.max(oauthMaxClientNameLength)
			.refine(isValidClientName, 'client_name must not contain control or confusable characters'),
		redirect_uris: z
			.array(z.string().url().max(oauthMaxRedirectUriLength))
			.min(1, 'At least one redirect URI is required')
			.max(oauthMaxRedirectUriCount)
			.refine(
				(uris) => uris.every(isValidRedirectUri),
				'Redirect URIs must use HTTPS (or http://localhost for development)',
			),
		grant_types: z
			.array(z.enum(['authorization_code', 'refresh_token']))
			.max(oauthMaxGrantTypeCount)
			.default(['authorization_code', 'refresh_token']),
		response_types: z
			.array(z.enum(['code']))
			.max(oauthMaxResponseTypeCount)
			.default(['code']),
		// A CIMD identifier is a self-hosted, publicly readable document with
		// no mechanism for conveying or verifying a client secret. Only
		// `none` (PKCE-only, public client) is trustworthy here; anything
		// else this server cannot verify, so it is rejected rather than
		// silently defaulted or trusted.
		token_endpoint_auth_method: z.literal('none').default('none'),
		application_type: z.enum(applicationTypes).optional(),
	})
	.superRefine((data, ctx) => {
		if (!documentRedirectUrisMatchApplicationType(data.redirect_uris, data.application_type)) {
			ctx.addIssue({
				code: 'custom',
				message: 'application_type "web" requires every redirect_uri to use HTTPS.',
				path: ['redirect_uris'],
			});
		}
	});

export type ClientIdMetadataDocument = {
	clientId: string;
	clientName: string;
	redirectUris: string[];
	grantTypes: string[];
	responseTypes: string[];
	applicationType: 'web' | 'native' | null;
};

type CacheEntry = { document: ClientIdMetadataDocument; expiresAt: number };

/**
 * Bounded, in-memory, process-local cache — not Redis. A stale or evicted
 * entry only costs one extra fetch to the client's own endpoint on the
 * next authorization request; it is never a correctness hazard, so a
 * process-local cache (simpler, no new infrastructure dependency) is
 * sufficient. Insertion-order eviction (delete the oldest key once the cap
 * is hit) keeps this bounded without needing a full LRU.
 */
const documentCache = new Map<string, CacheEntry>();

function cacheDocument(document: ClientIdMetadataDocument, expiresAt: number): void {
	documentCache.delete(document.clientId);
	documentCache.set(document.clientId, { document, expiresAt });
	while (documentCache.size > cimdCacheMaxEntries) {
		const oldestKey = documentCache.keys().next().value;
		if (oldestKey === undefined) break;
		documentCache.delete(oldestKey);
	}
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
	const declaredLength = response.headers.get('content-length');
	if (declaredLength !== null) {
		const declaredBytes = Number(declaredLength);
		if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
			throw new ClientMetadataDocumentFetchError('response_too_large');
		}
	}

	if (!response.body) return '';

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let receivedBytes = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		receivedBytes += value.byteLength;
		if (receivedBytes > maxBytes) {
			await reader.cancel(new Error('response too large')).catch(() => {});
			throw new ClientMetadataDocumentFetchError('response_too_large');
		}

		chunks.push(value);
	}

	const combined = new Uint8Array(receivedBytes);
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.byteLength;
	}

	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(combined);
	} catch {
		throw new ClientMetadataDocumentFetchError('invalid_encoding');
	}
}

/**
 * Fetches, validates, and caches the Client ID Metadata Document at
 * `clientId`. Returns `null` for every failure mode (not publicly
 * routable, unreachable, wrong content type, oversized, malformed JSON,
 * schema violation, a `client_id` field that does not exactly match this
 * URL) rather than throwing, so every caller has exactly one branch to
 * handle: "no usable document" — never a distinguishable error a caller
 * could use to probe internal network shape.
 */
export async function fetchClientIdMetadataDocument(
	clientId: string,
	dependencies: ClientMetadataDocumentFetchDependencies = {},
): Promise<ClientIdMetadataDocument | null> {
	if (!isClientIdMetadataDocumentUrl(clientId)) return null;

	const now = dependencies.now ?? Date.now;
	const cached = documentCache.get(clientId);
	if (cached && cached.expiresAt > now()) {
		return cached.document;
	}

	const fetchImpl = dependencies.fetchImpl ?? fetch;
	const lookupImpl = dependencies.lookupImpl ?? lookupAll;
	const url = new URL(clientId);

	try {
		await assertHostnameIsPubliclyRoutable(
			stripIpv6Brackets(url.hostname),
			lookupImpl,
			dependencies.dnsTimeoutMs ?? cimdFetchTimeoutMs,
		);
	} catch (error) {
		logger.warn(
			{ err: error, clientIdHostname: url.hostname },
			'Rejected Client ID Metadata Document: hostname is not publicly routable',
		);
		return null;
	}

	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: 'GET',
			redirect: 'error',
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(cimdFetchTimeoutMs),
		});
	} catch (error) {
		logger.warn({ err: error }, 'Client ID Metadata Document fetch failed');
		return null;
	}

	if (!response.ok) return null;
	if (!isExactContentType(response.headers.get('content-type'), 'application/json')) return null;

	let bodyText: string;
	try {
		bodyText = await readBoundedResponseText(response, cimdMaxResponseBytes);
	} catch (error) {
		logger.warn({ err: error }, 'Client ID Metadata Document body rejected');
		return null;
	}

	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(bodyText);
	} catch {
		return null;
	}

	const parsed = clientMetadataDocumentSchema.safeParse(parsedJson);
	if (!parsed.success) return null;

	// draft-ietf-oauth-client-id-metadata-document-00 §2: the authorization
	// server MUST validate the document's own `client_id` field matches the
	// URL it was fetched from exactly — otherwise a document could be
	// hosted at one URL and claim to speak for another.
	if (parsed.data.client_id !== clientId) return null;

	const document: ClientIdMetadataDocument = {
		clientId,
		clientName: parsed.data.client_name,
		redirectUris: parsed.data.redirect_uris,
		grantTypes: parsed.data.grant_types,
		responseTypes: parsed.data.response_types,
		applicationType: parsed.data.application_type ?? null,
	};

	cacheDocument(document, now() + cimdCacheTtlMs);
	return document;
}

/** Test-only: clears the module-local cache so tests don't leak state across files/cases. */
export function clearClientIdMetadataDocumentCacheForTests(): void {
	documentCache.clear();
}

/**
 * Test-only: resets the DNS lookup concurrency limiter's process-global
 * state. `outstandingDnsLookupCount` and `inFlightDnsLookupsByHostname` are
 * shared across every test file in the same process -- without this, a test
 * that saturates the limiter (or leaves a lookup in flight past its own
 * test's lifetime) would leak that state into the next test file's run.
 */
export function resetDnsLookupConcurrencyLimiterForTests(): void {
	outstandingDnsLookupCount = 0;
	inFlightDnsLookupsByHostname.clear();
}
