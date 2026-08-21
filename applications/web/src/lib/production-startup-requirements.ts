/**
 * Pure, side-effect-free production readiness checks.
 *
 * This file must never import `@web/env`, `@template/database/env`, or
 * `@web/lib/redis-client` — each of those modules validates the real
 * `process.env` at import time and throws on an invalid or incomplete
 * environment. Keeping this logic parameter-only lets two very different
 * callers share it without either one triggering that validation:
 *
 * - `startup-invariants.ts` calls it with the live, already-validated
 *   environment singletons, once, before `Bun.serve` accepts traffic.
 * - `scripts/doctor.ts` calls it with a candidate configuration built from
 *   `.env.local` (or a `--production` operator's real shell environment),
 *   so it can report every failure as a readable diagnostic line instead of
 *   an uncaught exception.
 *
 * Both callers get the exact same verdict for the exact same input — this
 * is the single definition of "production-ready configuration," not a
 * parallel one.
 */

/**
 * A small, deliberately conservative denylist of connection-string
 * credentials that show up in documentation, examples, and copy-pasted
 * scaffolding. Not exhaustive — this is a cheap check for the obvious
 * mistake (shipping the literal placeholder from `.env.example`), not a
 * credential-strength auditor.
 */
const knownPlaceholderCredentials = new Set([
	'user:password',
	'admin:admin',
	'test:test',
	'postgres:postgres',
	'guest:guest',
	'root:root',
	'changeme:changeme',
]);

const loopbackHostnames = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function extractHostAndCredentials(
	rawUrl: string,
): { host: string; credentials: string | null } | null {
	try {
		const url = new URL(rawUrl);
		const credentials = url.username || url.password ? `${url.username}:${url.password}` : null;
		return { host: url.hostname.toLowerCase(), credentials };
	} catch {
		return null;
	}
}

function databaseUrlFailures(label: string, rawUrl: string): string[] {
	const failures: string[] = [];
	const parsed = extractHostAndCredentials(rawUrl);

	if (!parsed) {
		failures.push(`${label} could not be parsed as a URL.`);
		return failures;
	}

	if (loopbackHostnames.has(parsed.host) || parsed.host.endsWith('.localtest.me')) {
		failures.push(
			`${label} points at a local host (${parsed.host}). Production requires a real, ` +
				'remotely reachable database host.',
		);
	}

	if (parsed.credentials && knownPlaceholderCredentials.has(parsed.credentials.toLowerCase())) {
		failures.push(`${label} uses placeholder credentials. Set real production credentials.`);
	}

	if (!/[?&]sslmode=(require|verify-ca|verify-full)\b/i.test(rawUrl)) {
		failures.push(
			`${label} must include an encrypted, certificate-verified connection ` +
				'(sslmode=require or stronger) in production.',
		);
	}

	return failures;
}

function redisUrlFailures(rawUrl: string): string[] {
	const failures: string[] = [];
	const parsed = extractHostAndCredentials(rawUrl);

	if (!parsed) {
		failures.push('REDIS_URL could not be parsed as a URL.');
		return failures;
	}

	if (!rawUrl.startsWith('rediss://')) {
		failures.push(
			'REDIS_URL must use the encrypted, certificate-verified `rediss://` scheme in production.',
		);
	}

	if (loopbackHostnames.has(parsed.host)) {
		failures.push(
			`REDIS_URL points at a local host (${parsed.host}). Production requires a real, ` +
				'remotely reachable Redis host.',
		);
	}

	if (parsed.credentials && knownPlaceholderCredentials.has(parsed.credentials.toLowerCase())) {
		failures.push('REDIS_URL uses placeholder credentials. Set real production credentials.');
	}

	return failures;
}

export interface ProductionStartupConfiguration {
	nodeEnvironment: string;
	baseUrl: string | undefined;
	redisUrl: string | undefined;
	isRedisConfigured: boolean;
	databaseUrl: string;
	databaseUrlUnpooled: string | undefined;
	databaseLocalProxyUrl: string | undefined;
	googleClientId: string | undefined;
	googleClientSecret: string | undefined;
	trustedProxyCidrs: string | undefined;
	trustedProxyHeader: string | undefined;
}

/**
 * Evaluates `configuration` against every fail-closed production
 * requirement and returns the list of human-readable failures — empty when
 * the configuration is production-ready. Never throws and never includes a
 * secret value in a returned message, only whether a value is present and
 * whether it satisfies its constraint.
 */
export function collectProductionStartupFailures(
	configuration: ProductionStartupConfiguration,
): string[] {
	const failures: string[] = [];

	if (configuration.nodeEnvironment !== 'production') {
		failures.push(
			`NODE_ENV is "${configuration.nodeEnvironment}", not "production". The development-only ` +
				'authentication route stays reachable outside production.',
		);
	}

	if (!configuration.baseUrl) {
		failures.push(
			'BASE_URL is not set. Production must advertise one canonical, HTTPS base URL for ' +
				'OAuth issuer identity and MCP resource metadata rather than deriving it per-request.',
		);
	} else if (!configuration.baseUrl.startsWith('https://')) {
		failures.push(`BASE_URL (${configuration.baseUrl}) must use https:// in production.`);
	}

	if (!configuration.isRedisConfigured) {
		failures.push(
			'REDIS_URL is not set. Production must use the shared, atomic Redis-backed rate limiter — ' +
				'the in-memory fallback is per-process and does not protect a multi-instance deployment.',
		);
	} else if (configuration.redisUrl) {
		failures.push(...redisUrlFailures(configuration.redisUrl));
	}

	if (!configuration.trustedProxyCidrs || !configuration.trustedProxyHeader) {
		failures.push(
			'TRUSTED_PROXY_CIDRS and TRUSTED_PROXY_HEADER are not both set. Production runs behind a ' +
				"reverse proxy; without both, every request falls back to the proxy's own socket " +
				'address for rate limiting and network identity instead of the real client, and the ' +
				'atomic rate limiter above stops protecting individual clients.',
		);
	}

	if (configuration.databaseLocalProxyUrl) {
		failures.push(
			'DATABASE_LOCAL_PROXY_URL is set. It exists only to route local development and test ' +
				'traffic through a local Neon-compatible proxy and must never be set in production.',
		);
	}

	failures.push(...databaseUrlFailures('DATABASE_URL', configuration.databaseUrl));
	if (configuration.databaseUrlUnpooled) {
		failures.push(
			...databaseUrlFailures('DATABASE_URL_UNPOOLED', configuration.databaseUrlUnpooled),
		);
	}

	const hasGoogleClientId = Boolean(configuration.googleClientId);
	const hasGoogleClientSecret = Boolean(configuration.googleClientSecret);
	if (hasGoogleClientId !== hasGoogleClientSecret) {
		failures.push(
			'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set or both be absent — a ' +
				'partial Google sign-in configuration cannot issue a valid authorization request.',
		);
	}

	return failures;
}
