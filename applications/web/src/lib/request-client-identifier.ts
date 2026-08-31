import { environment } from '@web/env';
import {
	resolveOauthNetworkIdentity,
	type TrustedProxyConfiguration,
} from '@lostgradient/mcp/oauth';

/**
 * Builds the trusted-proxy configuration from the environment. Trusts
 * nothing by default: forwarding headers are only honored once an operator
 * explicitly lists which upstream proxies (`TRUSTED_PROXY_CIDRS`) and which
 * header (`TRUSTED_PROXY_HEADER`) to trust.
 */
export function getTrustedProxyConfiguration(): TrustedProxyConfiguration {
	return {
		trustedProxyCidrs: environment.trustedProxyCidrs
			? environment.trustedProxyCidrs
					.split(',')
					.map((cidr) => cidr.trim())
					.filter(Boolean)
			: [],
		trustedProxyHeader: environment.trustedProxyHeader,
		trustedProxyHopCount: environment.trustedProxyHopCount,
	};
}

/**
 * Resolves the one canonical network identity for a request: the verified
 * socket address, unless it belongs to a configured trusted proxy, in which
 * case the configured forwarding header is trusted instead. This should be
 * called exactly once per request (see `application.ts`, which stores the
 * result on `RequestContext.networkIdentity`) — every other module must
 * consume that context value rather than re-deriving identity from headers.
 */
export function getRequestClientIdentifier(input: {
	request: Request;
	socketAddress?: string;
}): string {
	return resolveOauthNetworkIdentity({
		socketAddress: input.socketAddress,
		headers: input.request.headers,
		configuration: getTrustedProxyConfiguration(),
	});
}
