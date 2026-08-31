import { isValidRedirectUri } from './security-utilities.js';

function isLoopbackRedirectUri(parsed: URL): boolean {
	return (
		parsed.protocol === 'http:' &&
		(parsed.hostname === 'localhost' ||
			parsed.hostname === '127.0.0.1' ||
			parsed.hostname === '[::1]')
	);
}

/** RFC 8252 port-flexible matching for native loopback redirects; every other URI matches exactly. */
export function redirectUriMatchesRegistered(
	requestedUri: string,
	registeredUris: readonly string[],
): boolean {
	if (!isValidRedirectUri(requestedUri)) return false;
	const validRegisteredUris = registeredUris.filter(isValidRedirectUri);
	if (validRegisteredUris.includes(requestedUri)) return true;

	const requested = new URL(requestedUri);
	if (!isLoopbackRedirectUri(requested)) return false;

	return validRegisteredUris.some((registeredUri) => {
		const registered = new URL(registeredUri);
		return (
			isLoopbackRedirectUri(registered) &&
			registered.hostname === requested.hostname &&
			registered.pathname === requested.pathname &&
			registered.search === requested.search
		);
	});
}
