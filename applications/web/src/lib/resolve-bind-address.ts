/**
 * Decides which network interface the web server listens on.
 *
 * The default is deliberately restrictive: outside production the server binds
 * to loopback, so a forgotten `NODE_ENV` or a plain `bun turbo dev` is never
 * reachable from the LAN. That is the right protection on a developer machine.
 *
 * It is the wrong control inside a container. A container is already an
 * isolation boundary, and a process bound to `127.0.0.1` there is unreachable
 * through a published port — which is what made `test:container-smoke` time out
 * once the build stopped baking `NODE_ENV` into the bundle.
 *
 * So the bind address is configurable rather than inferred. Setting
 * `SERVER_BIND_ADDRESS` is a deliberate act by whoever runs the process; when it
 * is absent the restrictive default still applies.
 */

/** Bun treats `undefined` as "listen on every interface". */
export const ALL_INTERFACES = undefined;

export const LOOPBACK_ADDRESS = '127.0.0.1';

export function resolveBindAddress(input: {
	nodeEnvironment: 'development' | 'production' | 'test';
	configuredBindAddress: string | undefined;
}): string | undefined {
	if (input.configuredBindAddress !== undefined) {
		return input.configuredBindAddress === '0.0.0.0' ? ALL_INTERFACES : input.configuredBindAddress;
	}

	return input.nodeEnvironment === 'production' ? ALL_INTERFACES : LOOPBACK_ADDRESS;
}

/** What to show an operator in the startup log, where `undefined` is not useful. */
export function describeBindAddress(bindAddress: string | undefined): string {
	return bindAddress ?? '0.0.0.0';
}
