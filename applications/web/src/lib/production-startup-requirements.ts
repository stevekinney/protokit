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

import { isValidCidr } from '@web/lib/trusted-proxy';

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
): { host: string; credentials: string | null; scheme: string } | null {
	try {
		const url = new URL(rawUrl);
		const credentials = url.username || url.password ? `${url.username}:${url.password}` : null;
		// `URL#hostname` keeps the square brackets around an IPv6 literal
		// (e.g. `[::1]`), but this file's loopback denylist stores bare
		// addresses (`::1`). Strip them here, once, so every caller's
		// `loopbackHostnames.has(...)` check actually matches an IPv6 host —
		// confirmed directly: `new URL('rediss://[::1]:6379').hostname` is
		// `'[::1]'`, not `'::1'`.
		const host = url.hostname.toLowerCase();
		const unbracketed = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
		return { host: unbracketed, credentials, scheme: url.protocol.toLowerCase() };
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

	// The runtime driver (`@neondatabase/serverless`'s `neon()`, via
	// `drizzle-orm/neon-http`) expects a `postgres:`/`postgresql:` connection
	// string. A value that is a well-formed, non-loopback URL using some
	// other scheme (e.g. `https://db.example.com/database?sslmode=verify-full`
	// — parseable, non-loopback, and carrying the required query parameter)
	// would otherwise pass every check above and only fail once the server
	// tries to actually query the database.
	if (parsed.scheme !== 'postgres:' && parsed.scheme !== 'postgresql:') {
		failures.push(
			`${label} must use the postgres:// or postgresql:// scheme (got "${parsed.scheme}").`,
		);
	}

	// Only `verify-full` actually validates the server certificate: PostgreSQL's
	// documented semantics for `require` are "encrypt, but do not verify" (no
	// defense against an active MITM that presents any cert), and `verify-ca`
	// checks the certificate chains to a trusted CA without checking the
	// hostname on it — against the public trust store every managed provider
	// uses (Neon included; Neon documents and recommends `verify-full` and
	// chains to the public Let's Encrypt root), that means `verify-ca` accepts
	// a valid cert for *any* host, not specifically this one. `verify-full` is
	// therefore the only value that satisfies "certificate validation."
	//
	// This is the configuration-layer half of the guarantee: it makes the
	// claim hold for every consumer of this same DATABASE_URL string, not only
	// the runtime driver — `drizzle-kit`'s CLI and any future wire-protocol
	// driver both parse and act on `sslmode`. The runtime driver actually in
	// use (`@neondatabase/serverless`'s `neon()`, via `drizzle-orm/neon-http`)
	// never reads `sslmode` at all — confirmed by inspecting the package: its
	// HTTP tag function builds a literal `https://` URL and always goes
	// through standard TLS-verified `fetch`. That transport-layer validation
	// is real and unconditional, but it depends on nothing disabling Node/Bun's
	// default certificate verification — see `nodeTlsRejectUnauthorized` below.
	if (!/[?&]sslmode=verify-full\b/i.test(rawUrl)) {
		failures.push(
			`${label} must include sslmode=verify-full in production. sslmode=require only ` +
				'encrypts the connection without verifying the server certificate, and ' +
				'sslmode=verify-ca verifies the certificate chain but not the hostname — neither ' +
				'defends against an active machine-in-the-middle presenting a different valid ' +
				'certificate.',
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
	/**
	 * `session-signing-secret.ts`'s `resolveSessionSigningSecrets` throws at
	 * module-import time when this is absent in production -- the real
	 * server cannot start without it. Outside production it is optional: an
	 * auto-generated fallback is used and sessions simply do not survive a
	 * restart. Checked here (rather than relying only on that module-level
	 * throw) so `scripts/doctor.ts` can report the same failure as a
	 * readable diagnostic before deployment instead of only as an uncaught
	 * exception during startup.
	 */
	sessionSigningSecret: string | undefined;
	/**
	 * The raw `NODE_TLS_REJECT_UNAUTHORIZED` value, unmodified. Setting it to
	 * `"0"` disables TLS certificate validation process-wide — confirmed
	 * directly against Bun's `fetch` (the Postgres transport, via
	 * `@neondatabase/serverless`) and it is Node's documented `tls` module
	 * default consulted by `node-redis`'s socket (the Redis transport). If
	 * this is `"0"`, every `sslmode=verify-full` and `rediss://` check above
	 * still passes syntactically while providing zero actual protection —
	 * this is the one lever that can silently falsify this file's entire
	 * certificate-validation claim, so it is checked independently of them.
	 * Optional so existing call sites and fixtures need no update; treated as
	 * "not disabling validation" when absent, matching Node's own default.
	 */
	nodeTlsRejectUnauthorized?: string | undefined;
	/**
	 * Review round 4 / P2: `shouldEnableConformanceMode()`
	 * (`mcp-handler.ts`) only ever checked `PROTOKIT_TUNNEL_ACTIVE`, never
	 * `NODE_ENV` -- so a production deployment misconfigured with
	 * `MCP_CONFORMANCE_MODE=true` (production always has `tunnelActive:
	 * false`) registered the full synthetic conformance registry
	 * (`registerConformanceFixtures`), including `list_audit_events` and the
	 * `test_*` fixtures the comments throughout that module explicitly
	 * describe as dev/test-only. Those fixtures sit outside the production
	 * definitions' `requiredScope` checks, so any otherwise-valid OAuth
	 * token could discover and invoke them. Fail closed at startup instead
	 * of trusting every deployment to remember to unset the flag.
	 */
	mcpConformanceModeConfigured: boolean;
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

	// Checked first and unconditionally: this disables TLS certificate
	// validation process-wide (confirmed directly against Bun's `fetch`,
	// which is the actual Postgres transport via `@neondatabase/serverless`,
	// and it is Node's documented `tls` module default that `node-redis`'s
	// socket also consults for `rediss://`). If this is set, every check
	// below can pass syntactically while the transport genuinely validates
	// nothing — see the field's doc comment on `ProductionStartupConfiguration`.
	if (configuration.nodeTlsRejectUnauthorized === '0') {
		failures.push(
			'NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS certificate validation for every ' +
				'HTTPS and TLS connection in this process, including the Postgres (HTTPS) and ' +
				'Redis (rediss://) connections this file otherwise requires to be ' +
				'certificate-verified. Unset it in production.',
		);
	}

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
	} else {
		// `getBaseUrl` (`src/lib/base-url.ts`) concatenates this value
		// directly with `/oauth/token`, `/auth/google/callback`, and `/mcp`
		// — a path, query, fragment, or embedded userinfo on BASE_URL would
		// land inside those derived URLs (e.g. a trailing path turns
		// `/oauth/token` into a path segment under it; a query string puts
		// the endpoint suffix after `?`), pointing OAuth metadata and
		// redirects at unserved locations. Require a canonical origin: only
		// scheme + host (+ optional port), nothing else.
		try {
			const parsed = new URL(configuration.baseUrl);
			const isCanonicalOrigin =
				parsed.origin === configuration.baseUrl &&
				parsed.pathname === '/' &&
				!parsed.search &&
				!parsed.hash &&
				!parsed.username &&
				!parsed.password;
			if (!isCanonicalOrigin) {
				failures.push(
					`BASE_URL (${configuration.baseUrl}) must be a canonical origin (scheme, host, and ` +
						'optional port only — no path, query, fragment, or userinfo). Endpoint paths are ' +
						'appended to this value directly.',
				);
			}
		} catch {
			failures.push(`BASE_URL (${configuration.baseUrl}) could not be parsed as a URL.`);
		}
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
	} else {
		// `isAddressInCidr` (the function that actually consumes each of
		// these entries at request time) silently returns `false` for a
		// malformed one — a typo would parse "successfully" here and then
		// match no socket peer ever, so every request would fall back to the
		// proxy's own socket address, collapsing rate limiting and
		// failed-authentication lockouts onto one shared bucket for every
		// real client. Parse and reject a malformed entry now, while startup
		// can still fail closed, instead of discovering it in production
		// traffic.
		const cidrs = configuration.trustedProxyCidrs
			.split(',')
			.map((cidr) => cidr.trim())
			.filter(Boolean);
		const malformedCidrs = cidrs.filter((cidr) => !isValidCidr(cidr));
		if (malformedCidrs.length > 0) {
			failures.push(
				`TRUSTED_PROXY_CIDRS contains malformed entries: ${malformedCidrs.join(', ')}. Each ` +
					'entry must be a valid IPv4 or IPv6 address with a prefix length that fits that ' +
					"family's address width (e.g. 10.0.0.0/8 or 2001:db8::/32).",
			);
		}
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

	if (!configuration.sessionSigningSecret) {
		failures.push(
			'SESSION_SIGNING_SECRET is not set. Production requires it -- ' +
				'resolveSessionSigningSecrets() refuses to auto-generate a fallback secret ' +
				'in production, so the server cannot start without it. Generate one with: ' +
				'openssl rand -hex 32',
		);
	}

	if (configuration.mcpConformanceModeConfigured) {
		failures.push(
			'MCP_CONFORMANCE_MODE is true. This registers the synthetic conformance-fixture ' +
				'registry (list_audit_events, test_* tools/resources/prompts) outside the ' +
				"production registry's requiredScope checks -- never set it in production.",
		);
	}

	// There is no production authentication provider other than Google sign-in
	// in this codebase: `/auth/dev/login` 404s whenever `NODE_ENV !==
	// 'development'` (`development-authentication-routes.ts`), and an
	// unauthenticated `/oauth/authorize` request unconditionally redirects to
	// `/auth/google/start` (`buildOauthSignInRedirectPath`,
	// `oauth-routes.tsx`). If Google credentials are both absent, that route
	// 404s or 503s (`isGoogleConfigured` in `google-authentication-routes.tsx`)
	// for every user, every time — a deployment can pass every other startup
	// check while nobody can sign in or approve an OAuth request. Both
	// credentials are therefore required outright in production, not merely
	// required to agree with each other.
	if (!configuration.googleClientId || !configuration.googleClientSecret) {
		failures.push(
			'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set in production. There is no ' +
				'other authentication provider: /auth/dev/login is disabled outside development, so ' +
				'without both, every unauthenticated user is redirected to an unconfigured Google ' +
				'sign-in route that returns 503.',
		);
	}

	return failures;
}
