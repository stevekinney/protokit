import { environment as databaseEnvironment } from '@template/database/env';
import { environment } from '@web/env';
import { isRedisConfigured } from '@web/lib/redis-client';

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

/**
 * Fail-closed production startup checks. Called once from `server.ts`
 * before `Bun.serve` accepts any traffic. Originally introduced narrowly by
 * SEC-003 for the shared atomic rate limiter; CONFIG-001 extends it with the
 * rest of production's fail-closed invariants (S-06 / S-20): no implicit
 * `development` mode, no insecure or absent database/Redis transport, no
 * canonical base URL omission, and no partially-configured Google sign-in.
 *
 * This function does not attempt a live network probe of Redis or
 * Postgres — that is what `/health` and the request-time paths already do.
 * It validates the *shape* of the configuration a production process was
 * handed, which is checkable instantly and without a live dependency.
 */
export function assertProductionStartupInvariants(): void {
	if (environment.NODE_ENV !== 'production') return;

	const failures: string[] = [];

	if (!environment.BASE_URL) {
		failures.push(
			'BASE_URL is not set. Production must advertise one canonical, HTTPS base URL for ' +
				'OAuth issuer identity and MCP resource metadata rather than deriving it per-request.',
		);
	} else if (!environment.BASE_URL.startsWith('https://')) {
		failures.push(`BASE_URL (${environment.BASE_URL}) must use https:// in production.`);
	}

	if (!isRedisConfigured()) {
		failures.push(
			'REDIS_URL is not set. Production must use the shared, atomic Redis-backed rate limiter — ' +
				'the in-memory fallback is per-process and does not protect a multi-instance deployment.',
		);
	} else if (environment.REDIS_URL) {
		failures.push(...redisUrlFailures(environment.REDIS_URL));
	}

	if (databaseEnvironment.DATABASE_LOCAL_PROXY_URL) {
		failures.push(
			'DATABASE_LOCAL_PROXY_URL is set. It exists only to route local development and test ' +
				'traffic through a local Neon-compatible proxy and must never be set in production.',
		);
	}

	failures.push(...databaseUrlFailures('DATABASE_URL', databaseEnvironment.DATABASE_URL));
	if (databaseEnvironment.DATABASE_URL_UNPOOLED) {
		failures.push(
			...databaseUrlFailures('DATABASE_URL_UNPOOLED', databaseEnvironment.DATABASE_URL_UNPOOLED),
		);
	}

	const hasGoogleClientId = Boolean(environment.GOOGLE_CLIENT_ID);
	const hasGoogleClientSecret = Boolean(environment.GOOGLE_CLIENT_SECRET);
	if (hasGoogleClientId !== hasGoogleClientSecret) {
		failures.push(
			'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set or both be absent — a ' +
				'partial Google sign-in configuration cannot issue a valid authorization request.',
		);
	}

	if (failures.length > 0) {
		throw new Error(`Refusing to start in production:\n- ${failures.join('\n- ')}`);
	}
}
