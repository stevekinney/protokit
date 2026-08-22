import { isIPv4, isIPv6 } from 'node:net';
import {
	canonicalizeIpAddress,
	expandIpv6Groups,
	stripPort,
} from '@web/lib/canonicalize-ip-address';

export type TrustedProxyHeader = 'x-forwarded-for' | 'forwarded' | 'cf-connecting-ip';

export type TrustedProxyConfiguration = {
	/** CIDR blocks (IPv4 or IPv6) whose immediate socket peer is trusted to supply a forwarding header. Empty means nothing is trusted. */
	trustedProxyCidrs: string[];
	/** Which forwarding header to trust, once the peer is verified trusted. `undefined` means never trust any header. */
	trustedProxyHeader: TrustedProxyHeader | undefined;
	/** How many trusted proxy hops precede the real client in a multi-value header. */
	trustedProxyHopCount: number;
};

function ipToBigInt(address: string): { family: 4 | 6; value: bigint } | null {
	if (isIPv4(address)) {
		const value = address
			.split('.')
			.map(Number)
			.reduce((accumulator, octet) => (accumulator << 8n) + BigInt(octet), 0n);
		return { family: 4, value };
	}

	if (isIPv6(address)) {
		const value = expandIpv6Groups(address).reduce(
			(accumulator, group) => (accumulator << 16n) + BigInt(Number.parseInt(group, 16)),
			0n,
		);
		return { family: 6, value };
	}

	return null;
}

/**
 * Returns whether `address` falls within `cidr` (e.g. `10.0.0.0/8` or
 * `2001:db8::/32`). Addresses are compared only within the same family —
 * an IPv4-mapped IPv6 address is first collapsed to plain IPv4 by
 * canonicalization, so it correctly matches an IPv4 CIDR.
 */
export function isAddressInCidr(address: string, cidr: string): boolean {
	const rangeInfo = parseCidr(cidr);
	if (!rangeInfo) return false;

	const canonicalAddress = canonicalizeIpAddress(address);
	const addressInfo = ipToBigInt(canonicalAddress);
	if (!addressInfo || addressInfo.family !== rangeInfo.family) return false;

	const width = addressInfo.family === 4 ? 32 : 128;
	if (rangeInfo.prefixLength === 0) return true;

	const shift = BigInt(width - rangeInfo.prefixLength);
	return addressInfo.value >> shift === rangeInfo.value >> shift;
}

function parseCidr(cidr: string): { family: 4 | 6; value: bigint; prefixLength: number } | null {
	const parts = cidr.split('/');
	if (parts.length !== 2) return null;
	const [rangeAddress, prefixLengthText] = parts;
	if (!rangeAddress || !prefixLengthText) return null;

	// Reject anything `Number.parseInt` would otherwise silently tolerate
	// (leading/trailing garbage such as "8abc" or " 8"): the prefix must be
	// nothing but decimal digits.
	if (!/^\d+$/.test(prefixLengthText)) return null;
	const prefixLength = Number.parseInt(prefixLengthText, 10);

	const rangeInfo = ipToBigInt(canonicalizeIpAddress(rangeAddress));
	if (!rangeInfo) return null;

	const width = rangeInfo.family === 4 ? 32 : 128;
	if (prefixLength > width) return null;

	return { ...rangeInfo, prefixLength };
}

/**
 * Whether `cidr` is syntactically valid and addressable (a real IPv4 or
 * IPv6 range address, with a prefix length that fits that family's
 * address width). Used at startup to fail closed on a malformed
 * `TRUSTED_PROXY_CIDRS` entry instead of letting it silently match nothing
 * — see `production-startup-requirements.ts`.
 */
export function isValidCidr(cidr: string): boolean {
	return parseCidr(cidr) !== null;
}

function isSocketPeerTrusted(
	canonicalSocketAddress: string,
	configuration: TrustedProxyConfiguration,
): boolean {
	return configuration.trustedProxyCidrs.some((cidr) =>
		isAddressInCidr(canonicalSocketAddress, cidr),
	);
}

function parseForwardedForHeaderValue(part: string): string | null {
	const match = /for=("?)([^;,"]+)\1/i.exec(part.trim());
	return match ? match[2] : null;
}

function selectHopFromEnd(entries: string[], hopCount: number): string | null {
	if (entries.length === 0) return null;
	const index = entries.length - hopCount;
	// A hop count that exceeds the number of entries actually present means
	// the forwarding chain is shorter than configured — the trusted proxy
	// appended fewer hops than expected, so the leftmost remaining entry is
	// not verified to have been written by a trusted proxy at all; it could
	// be a value the client itself supplied. Rather than clamping to index 0
	// and trusting that unverified entry, reject the header outright so the
	// caller falls back to the (verified) socket address.
	if (index < 0) return null;
	return entries[Math.min(index, entries.length - 1)] ?? null;
}

function extractForwardedAddress(
	headers: Headers,
	configuration: TrustedProxyConfiguration,
): string | null {
	if (configuration.trustedProxyHeader === 'cf-connecting-ip') {
		const value = headers.get('cf-connecting-ip');
		return value ? stripPort(value) : null;
	}

	if (configuration.trustedProxyHeader === 'x-forwarded-for') {
		const raw = headers.get('x-forwarded-for');
		if (!raw) return null;
		const entries = raw
			.split(',')
			.map((entry) => stripPort(entry.trim()))
			.filter(Boolean);
		return selectHopFromEnd(entries, configuration.trustedProxyHopCount);
	}

	if (configuration.trustedProxyHeader === 'forwarded') {
		const raw = headers.get('forwarded');
		if (!raw) return null;
		const entries = raw
			.split(',')
			.map(parseForwardedForHeaderValue)
			.filter((value): value is string => Boolean(value))
			.map((value) => stripPort(value));
		return selectHopFromEnd(entries, configuration.trustedProxyHopCount);
	}

	return null;
}

/**
 * Resolves the network identity of a request: the socket address, unless
 * that socket address is itself a trusted proxy, in which case the
 * configured forwarding header (read only from the trusted side of the
 * chain) is trusted instead. Every result is canonicalized so IPv4,
 * IPv4-mapped IPv6, and alternate IPv6 spellings collapse to one identity.
 */
export function resolveNetworkIdentity(input: {
	socketAddress: string | undefined;
	headers: Headers;
	configuration: TrustedProxyConfiguration;
}): string {
	const canonicalSocketAddress = input.socketAddress
		? canonicalizeIpAddress(input.socketAddress)
		: undefined;

	if (
		!canonicalSocketAddress ||
		!input.configuration.trustedProxyHeader ||
		input.configuration.trustedProxyCidrs.length === 0 ||
		!isSocketPeerTrusted(canonicalSocketAddress, input.configuration)
	) {
		return canonicalSocketAddress ?? 'unknown-client';
	}

	const forwardedAddress = extractForwardedAddress(input.headers, input.configuration);
	if (!forwardedAddress) {
		return canonicalSocketAddress;
	}

	return canonicalizeIpAddress(forwardedAddress);
}
