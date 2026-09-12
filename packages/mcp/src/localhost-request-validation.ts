const localhostHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizeHostname(hostname: string): string {
	return hostname.trim().toLowerCase();
}

function isLocalhostHostname(hostname: string): boolean {
	return localhostHostnames.has(normalizeHostname(hostname));
}

function parseHostnameFromHostHeader(hostHeader: string | null): string | null {
	if (!hostHeader) {
		return null;
	}

	const firstValue = hostHeader.split(',')[0].trim();
	if (firstValue.length === 0) {
		return null;
	}

	if (firstValue.startsWith('[')) {
		const endIndex = firstValue.indexOf(']');
		if (endIndex === -1) return null;
		return firstValue.slice(0, endIndex + 1);
	}

	const separatorIndex = firstValue.indexOf(':');
	if (separatorIndex === -1) {
		return firstValue;
	}
	return firstValue.slice(0, separatorIndex);
}

function parseHostnameFromOriginHeader(originHeader: string | null): string | null {
	if (!originHeader || originHeader === 'null') {
		return null;
	}

	try {
		const parsedOrigin = new URL(originHeader);
		// URL parsing also accepts opaque schemes and URLs with paths or credentials.
		// An Origin header must contain only the serialized, non-opaque origin.
		if (parsedOrigin.origin === 'null' || parsedOrigin.origin !== originHeader) {
			return null;
		}
		return parsedOrigin.hostname;
	} catch {
		return null;
	}
}

export function isLoopbackHostname(hostname: string): boolean {
	return isLocalhostHostname(hostname);
}

export function hasValidLocalhostRebindingHeaders(headers: Headers): boolean {
	const requestHost = parseHostnameFromHostHeader(headers.get('host'));
	if (requestHost && !isLocalhostHostname(requestHost)) {
		return false;
	}

	// TRI-79: Inspector's Node-fetch MCP connection needs the absent-header
	// allowance. A present opaque or malformed origin cannot establish localhost.
	const requestOrigin = headers.get('origin');
	if (requestOrigin !== null) {
		const requestOriginHost = parseHostnameFromOriginHeader(requestOrigin);
		if (!requestOriginHost || !isLocalhostHostname(requestOriginHost)) {
			return false;
		}
	}

	return true;
}
