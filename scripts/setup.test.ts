import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'bun:test';
import {
	applyPlannedRailwayVariables,
	collectRailwayProductionStartupFailures,
	isValidNeonRegionIdentifier,
	isValidProductionBaseUrl,
	isValidProductionRedisUrl,
	isValidTrustedProxyCidr,
	isValidTrustedProxyCidrList,
	isValidTrustedProxyHeader,
	isValidTrustedProxyHopCount,
	planRailwayVariables,
	RAILWAY_EXCLUDED_ENVIRONMENT_KEYS,
	shouldPromptForBaseUrl,
	shouldPromptForTrustedProxyCidrs,
	shouldPromptForTrustedProxyHeader,
} from './setup.ts';

/** A minimal, fully production-valid `.env.local`-shaped variable set, used as the base for the
 * `collectRailwayProductionStartupFailures` regression tests below — each test knocks out
 * exactly one field to prove that specific gap is caught. */
function validProductionVariables(): Record<string, string | undefined> {
	return {
		NODE_ENV: 'development',
		MCP_SERVER_NAME: 'protokit-test-server',
		BASE_URL: 'https://example.com',
		DATABASE_URL: 'postgres://user:pass@db.example.com/db?sslmode=verify-full',
		DATABASE_URL_UNPOOLED: 'postgres://user:pass@db.example.com/db?sslmode=verify-full',
		GOOGLE_CLIENT_ID: 'google-client-id',
		GOOGLE_CLIENT_SECRET: 'google-client-secret',
		TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
		TRUSTED_PROXY_HEADER: 'x-forwarded-for',
		SESSION_SIGNING_SECRET: 'a'.repeat(64),
	};
}

describe('MCP setup phase', () => {
	const setupSource = readFileSync(new URL('./setup.ts', import.meta.url), 'utf8');
	const mcpPhaseSource = setupSource.slice(
		setupSource.indexOf('async function setupMcpProtocolAndExtensions'),
		setupSource.indexOf('export function isValidProductionBaseUrl'),
	);

	test('writes an explicit MCP_SERVER_NAME when it is absent', () => {
		expect(mcpPhaseSource).toContain("getEnvironmentValue('MCP_SERVER_NAME')");
		expect(mcpPhaseSource).toContain("appendToEnvironmentFile('MCP_SERVER_NAME'");
	});
});

describe('isValidNeonRegionIdentifier', () => {
	test('accepts real Neon region identifiers', () => {
		expect(isValidNeonRegionIdentifier('aws-us-east-2')).toBe(true);
		expect(isValidNeonRegionIdentifier('azure-eastus2')).toBe(true);
		expect(isValidNeonRegionIdentifier('aws-eu-central-1')).toBe(true);
	});

	test('rejects values that could inject additional CLI arguments or shell metacharacters', () => {
		expect(isValidNeonRegionIdentifier('aws-us-east-2 --org-id evil')).toBe(false);
		expect(isValidNeonRegionIdentifier('aws-us-east-2; rm -rf /')).toBe(false);
		expect(isValidNeonRegionIdentifier('$(whoami)')).toBe(false);
		expect(isValidNeonRegionIdentifier('aws-us-east-2\n--flag')).toBe(false);
		expect(isValidNeonRegionIdentifier('')).toBe(false);
		expect(isValidNeonRegionIdentifier('-leading-hyphen')).toBe(false);
	});
});

describe('planRailwayVariables', () => {
	// Regression for a bot-reported P1: the previous unfiltered `.env.local` -> Railway copy
	// pushed the local developer's `NODE_ENV=development`, which overrides the image's baked
	// `ENV NODE_ENV=production` (Dockerfile runtime stage) and reintroduces CONFIG-001's
	// fail-closed invariants being vacuous plus the loopback-bind unreachability from `OPEN-1`.
	test('never forwards the local NODE_ENV value and always forces NODE_ENV=production', () => {
		const plan = planRailwayVariables({ NODE_ENV: 'development', DATABASE_URL: 'postgres://x' });
		const asRecord = Object.fromEntries(plan);

		expect(asRecord.NODE_ENV).toBe('production');
		expect(asRecord.DATABASE_URL).toBe('postgres://x');
	});

	test('forces NODE_ENV=production even when .env.local never set NODE_ENV at all', () => {
		const plan = planRailwayVariables({ DATABASE_URL: 'postgres://x' });
		expect(Object.fromEntries(plan).NODE_ENV).toBe('production');
	});

	test('excludes DATABASE_LOCAL_PROXY_URL and PROTOKIT_TUNNEL_ACTIVE — local-only values', () => {
		const plan = planRailwayVariables({
			DATABASE_LOCAL_PROXY_URL: 'http://db.localtest.me:4444/sql',
			PROTOKIT_TUNNEL_ACTIVE: 'true',
			GOOGLE_CLIENT_ID: 'client-id',
		});
		const keys = plan.map(([key]) => key);

		expect(keys).not.toContain('DATABASE_LOCAL_PROXY_URL');
		expect(keys).not.toContain('PROTOKIT_TUNNEL_ACTIVE');
		expect(keys).toContain('GOOGLE_CLIENT_ID');
	});

	test('skips empty-string values, matching the pre-existing behavior for unset entries', () => {
		const plan = planRailwayVariables({ SESSION_COOKIE_NAME: '' });
		expect(plan.map(([key]) => key)).not.toContain('SESSION_COOKIE_NAME');
	});

	test('every key appears at most once', () => {
		const plan = planRailwayVariables({ NODE_ENV: 'development', DATABASE_URL: 'postgres://x' });
		const keys = plan.map(([key]) => key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	// Regression for a bot-reported P1: `setupRedis`'s local development default
	// (`redis://localhost:6379`) fails every one of `isValidProductionRedisUrl`'s checks, and the
	// unfiltered `.env.local` -> Railway copy previously pushed it verbatim, producing a Railway
	// deployment `assertProductionStartupInvariants` refuses to start.
	test('excludes REDIS_URL from the generic .env.local copy', () => {
		expect(RAILWAY_EXCLUDED_ENVIRONMENT_KEYS.has('REDIS_URL')).toBe(true);
		const plan = planRailwayVariables({ REDIS_URL: 'redis://localhost:6379' });
		expect(plan.map(([key]) => key)).not.toContain('REDIS_URL');
	});

	test('an override value is pushed even though the same key is excluded from the generic copy', () => {
		const plan = planRailwayVariables(
			{ REDIS_URL: 'redis://localhost:6379' },
			{ REDIS_URL: 'rediss://user:pass@production-host:6380' },
		);
		expect(Object.fromEntries(plan).REDIS_URL).toBe('rediss://user:pass@production-host:6380');
	});

	test('an override for NODE_ENV would win over the forced production value (no duplicate key)', () => {
		const plan = planRailwayVariables({}, { NODE_ENV: 'production' });
		const keys = plan.map(([key]) => key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(Object.fromEntries(plan).NODE_ENV).toBe('production');
	});
});

describe('isValidProductionBaseUrl', () => {
	test('accepts a canonical HTTPS origin', () => {
		expect(isValidProductionBaseUrl('https://your-app.up.railway.app')).toBe(true);
		expect(isValidProductionBaseUrl('https://example.com:8443')).toBe(true);
	});

	test('rejects http, a path, a query, a fragment, and embedded userinfo — matches production', () => {
		// Mirrors assertProductionStartupInvariants's canonical-origin check
		// (applications/web/src/lib/production-startup-requirements.ts) so setup never writes a
		// BASE_URL that production would reject at startup.
		expect(isValidProductionBaseUrl('http://your-app.up.railway.app')).toBe(false);
		expect(isValidProductionBaseUrl('https://your-app.up.railway.app/')).toBe(false);
		expect(isValidProductionBaseUrl('https://your-app.up.railway.app/path')).toBe(false);
		expect(isValidProductionBaseUrl('https://your-app.up.railway.app?query=1')).toBe(false);
		expect(isValidProductionBaseUrl('https://your-app.up.railway.app#fragment')).toBe(false);
		expect(isValidProductionBaseUrl('https://user:pass@your-app.up.railway.app')).toBe(false);
		expect(isValidProductionBaseUrl('not a url')).toBe(false);
		expect(isValidProductionBaseUrl('')).toBe(false);
	});
});

describe('BASE_URL setup phase ordering', () => {
	// Regression for a round-3 review finding (P1): a fresh full setup never collected BASE_URL
	// in any phase, yet `setupRailway` -> `planRailwayVariables` unconditionally forces
	// `NODE_ENV=production`, and `assertProductionStartupInvariants` then rejects the deployed
	// service for missing BASE_URL. This reads the actual source rather than re-implementing
	// runFullSetup, so it fails if the ordering regresses even though `runFullSetup` itself isn't
	// exported for direct invocation (it drives real interactive prompts and external CLIs).
	const source = readFileSync(new URL('./setup.ts', import.meta.url), 'utf8');

	test('a "base-url" phase exists and collects BASE_URL before Railway is configured', () => {
		expect(source).toContain("'base-url': async () => {");
		expect(source).toContain('await setupBaseUrl();');
	});

	test('runFullSetup calls setupBaseUrl before setupRailway', () => {
		const fullSetupBody = source.slice(
			source.indexOf('async function runFullSetup()'),
			source.indexOf("console.log('\\n=== Setup Complete ==="),
		);
		const baseUrlIndex = fullSetupBody.indexOf('await setupBaseUrl();');
		const railwayIndex = fullSetupBody.indexOf('await setupRailway();');

		expect(baseUrlIndex).toBeGreaterThan(-1);
		expect(railwayIndex).toBeGreaterThan(-1);
		expect(baseUrlIndex).toBeLessThan(railwayIndex);
	});

	test('setupRailway refuses to proceed without BASE_URL already present', () => {
		const railwayBody = source.slice(
			source.indexOf('async function setupRailway()'),
			source.indexOf('async function setupGithubSecrets'),
		);
		expect(railwayBody).toContain("getEnvironmentValue('BASE_URL')");
	});
});

describe('shouldPromptForBaseUrl', () => {
	// Regression for a round-9 review finding (P2): an existing BASE_URL was
	// previously accepted on presence alone, so a leftover local-dev value or
	// a URL with a path/query survived into `setupRailway` (which also only
	// checks presence) and production later refused to start. This is the
	// pure predicate `setupBaseUrl` now gates its skip check on.
	test('re-prompts when no value exists yet', () => {
		expect(shouldPromptForBaseUrl(undefined)).toBe(true);
	});

	test('does not re-prompt for an existing, valid production origin', () => {
		expect(shouldPromptForBaseUrl('https://your-app.up.railway.app')).toBe(false);
	});

	test('re-prompts for an existing localhost value', () => {
		expect(shouldPromptForBaseUrl('http://localhost:3000')).toBe(true);
	});

	test('re-prompts for an existing HTTPS value with a path', () => {
		expect(shouldPromptForBaseUrl('https://your-app.up.railway.app/callback')).toBe(true);
	});

	test('re-prompts for an existing HTTPS value with a query string', () => {
		expect(shouldPromptForBaseUrl('https://your-app.up.railway.app?ref=1')).toBe(true);
	});
});

describe('isValidProductionRedisUrl', () => {
	// Mirrors redisUrlFailures (applications/web/src/lib/production-startup-requirements.ts) so
	// setup never pushes a REDIS_URL production would reject at startup.
	test('accepts an encrypted, non-local endpoint', () => {
		expect(isValidProductionRedisUrl('rediss://production-host.example.com:6380')).toBe(true);
		expect(isValidProductionRedisUrl('rediss://user:pass@production-host.example.com:6380')).toBe(
			true,
		);
	});

	test('rejects the non-TLS scheme, loopback hosts, and known placeholder credentials', () => {
		expect(isValidProductionRedisUrl('redis://localhost:6379')).toBe(false);
		expect(isValidProductionRedisUrl('redis://production-host.example.com:6380')).toBe(false);
		expect(isValidProductionRedisUrl('rediss://localhost:6380')).toBe(false);
		expect(isValidProductionRedisUrl('rediss://127.0.0.1:6380')).toBe(false);
		expect(isValidProductionRedisUrl('rediss://[::1]:6380')).toBe(false);
		expect(isValidProductionRedisUrl('rediss://admin:admin@production-host.example.com:6380')).toBe(
			false,
		);
		expect(
			isValidProductionRedisUrl('rediss://postgres:postgres@production-host.example.com:6380'),
		).toBe(false);
		expect(isValidProductionRedisUrl('not a url')).toBe(false);
		expect(isValidProductionRedisUrl('')).toBe(false);
	});

	// B3 regression: `databaseUrlFailures` (production-startup-requirements.ts) already rejects
	// any host ending in `.localtest.me` — the local Docker/test-stack domain this repository's
	// own test scripts use (`db.localtest.me`) — but this setup-side Redis validator only checked
	// a small fixed set of loopback hostnames and let a `.localtest.me` host straight through,
	// so `setupRailway` could push a Redis endpoint that resolves to the local test stack as
	// though it were a real production host.
	test('rejects a .localtest.me host, matching the database check', () => {
		expect(isValidProductionRedisUrl('rediss://redis.localtest.me:6380')).toBe(false);
		expect(isValidProductionRedisUrl('rediss://cache.db.localtest.me:6380')).toBe(false);
	});
});

describe('isValidTrustedProxyCidr / isValidTrustedProxyCidrList', () => {
	// Mirrors isValidCidr (packages/mcp/src/oauth/network-identity.ts) so setup never writes a
	// TRUSTED_PROXY_CIDRS entry that isAddressInCidr would silently match nothing at request time.
	test('accepts real IPv4 and IPv6 CIDRs', () => {
		expect(isValidTrustedProxyCidr('10.0.0.0/8')).toBe(true);
		expect(isValidTrustedProxyCidr('2001:db8::/32')).toBe(true);
	});

	test('rejects a malformed entry, an out-of-range prefix, and non-CIDR input', () => {
		expect(isValidTrustedProxyCidr('10.0.0.0')).toBe(false);
		expect(isValidTrustedProxyCidr('10.0.0.0/33')).toBe(false);
		expect(isValidTrustedProxyCidr('2001:db8::/129')).toBe(false);
		expect(isValidTrustedProxyCidr('not-an-address/8')).toBe(false);
		expect(isValidTrustedProxyCidr('10.0.0.0/8abc')).toBe(false);
		expect(isValidTrustedProxyCidr('')).toBe(false);
	});

	test('a list is valid only when every comma-separated entry is', () => {
		expect(isValidTrustedProxyCidrList('10.0.0.0/8, 2001:db8::/32')).toBe(true);
		expect(isValidTrustedProxyCidrList('10.0.0.0/8, not-an-address')).toBe(false);
		expect(isValidTrustedProxyCidrList('')).toBe(false);
		expect(isValidTrustedProxyCidrList('   ')).toBe(false);
	});
});

describe('shouldPromptForTrustedProxyCidrs / shouldPromptForTrustedProxyHeader', () => {
	// Regression for the review finding at `scripts/setup.ts:422` (P2): an
	// existing TRUSTED_PROXY_CIDRS/TRUSTED_PROXY_HEADER pair was previously
	// accepted on presence alone -- `TRUSTED_PROXY_CIDRS=not-a-cidr` and
	// `TRUSTED_PROXY_HEADER=bogus` both satisfied the old `&&` skip check and
	// were copied through to Railway, where
	// `assertProductionStartupInvariants`/the environment schema reject them
	// at boot. Same predicate-driven shape as `shouldPromptForBaseUrl` above.
	test('re-prompts for CIDRs when no value exists yet', () => {
		expect(shouldPromptForTrustedProxyCidrs(undefined)).toBe(true);
	});

	test('does not re-prompt for an existing, valid CIDR list', () => {
		expect(shouldPromptForTrustedProxyCidrs('10.0.0.0/8, 2001:db8::/32')).toBe(false);
	});

	test('re-prompts for an existing invalid CIDR value', () => {
		expect(shouldPromptForTrustedProxyCidrs('not-a-cidr')).toBe(true);
	});

	test('re-prompts for the header when no value exists yet', () => {
		expect(shouldPromptForTrustedProxyHeader(undefined)).toBe(true);
	});

	test('does not re-prompt for an existing, valid header choice', () => {
		expect(shouldPromptForTrustedProxyHeader('x-forwarded-for')).toBe(false);
	});

	test('re-prompts for an existing invalid header value', () => {
		expect(shouldPromptForTrustedProxyHeader('bogus')).toBe(true);
	});
});

describe('isValidTrustedProxyHeader', () => {
	test('accepts every documented header choice', () => {
		expect(isValidTrustedProxyHeader('x-forwarded-for')).toBe(true);
		expect(isValidTrustedProxyHeader('forwarded')).toBe(true);
		expect(isValidTrustedProxyHeader('cf-connecting-ip')).toBe(true);
	});

	test('rejects an unknown or missing value', () => {
		expect(isValidTrustedProxyHeader('bogus')).toBe(false);
		expect(isValidTrustedProxyHeader('')).toBe(false);
		expect(isValidTrustedProxyHeader(undefined)).toBe(false);
	});
});

describe('isValidTrustedProxyHopCount', () => {
	// Mirrors TRUSTED_PROXY_HOP_COUNT's schema (applications/web/src/environment-schema.ts):
	// z.coerce.number().int().positive() -- a positive integer, coerced from a string.
	test('accepts positive integers', () => {
		expect(isValidTrustedProxyHopCount('1')).toBe(true);
		expect(isValidTrustedProxyHopCount('2')).toBe(true);
		expect(isValidTrustedProxyHopCount('42')).toBe(true);
	});

	test('rejects zero, negative, fractional, and nonnumeric values', () => {
		expect(isValidTrustedProxyHopCount('0')).toBe(false);
		expect(isValidTrustedProxyHopCount('-1')).toBe(false);
		expect(isValidTrustedProxyHopCount('1.5')).toBe(false);
		expect(isValidTrustedProxyHopCount('not-a-number')).toBe(false);
		expect(isValidTrustedProxyHopCount('')).toBe(false);
	});
});

describe('trusted proxy setup phase ordering', () => {
	// Regression for a bot-reported P1: no phase collected TRUSTED_PROXY_CIDRS or
	// TRUSTED_PROXY_HEADER, yet `assertProductionStartupInvariants` refuses production startup
	// without both — the same missing-phase defect the BASE_URL phase above was added to fix.
	const source = readFileSync(new URL('./setup.ts', import.meta.url), 'utf8');

	test('a "trusted-proxy" phase exists and collects both values before Railway is configured', () => {
		expect(source).toContain("'trusted-proxy': async () => {");
		expect(source).toContain('await setupTrustedProxy();');
	});

	test('runFullSetup calls setupTrustedProxy before setupRailway', () => {
		const fullSetupBody = source.slice(
			source.indexOf('async function runFullSetup()'),
			source.indexOf("console.log('\\n=== Setup Complete ==="),
		);
		const trustedProxyIndex = fullSetupBody.indexOf('await setupTrustedProxy();');
		const railwayIndex = fullSetupBody.indexOf('await setupRailway();');

		expect(trustedProxyIndex).toBeGreaterThan(-1);
		expect(railwayIndex).toBeGreaterThan(-1);
		expect(trustedProxyIndex).toBeLessThan(railwayIndex);
	});

	test('setupRailway refuses to proceed without TRUSTED_PROXY_CIDRS and TRUSTED_PROXY_HEADER already present', () => {
		const railwayBody = source.slice(
			source.indexOf('async function setupRailway()'),
			source.indexOf('async function setupGithubSecrets'),
		);
		expect(railwayBody).toContain("getEnvironmentValue('TRUSTED_PROXY_CIDRS')");
		expect(railwayBody).toContain("getEnvironmentValue('TRUSTED_PROXY_HEADER')");
	});

	test('setupRailway validates the Redis URL it pushes rather than copying .env.local verbatim', () => {
		const railwayBody = source.slice(
			source.indexOf('async function setupRailway()'),
			source.indexOf('async function setupGithubSecrets'),
		);
		expect(railwayBody).toContain('isValidProductionRedisUrl');
	});

	// Review finding (P2): `setupRailway` only hand-rolled three checks (BASE_URL,
	// TRUSTED_PROXY_CIDRS/HEADER, REDIS_URL) before copying the rest of `.env.local` to Railway
	// and forcing NODE_ENV=production, reporting success even when a setting
	// `assertProductionStartupInvariants` also requires -- Google credentials, DATABASE_URL's
	// sslmode=verify-full, SESSION_SIGNING_SECRET -- was missing or invalid. Unlike the
	// source-inspection tests above (necessary for the earlier three checks, since `setupRailway`
	// itself is an unexported, interactive, side-effecting function), `collectRailwayProductionStartupFailures`
	// is pure and exported, so this exercises the REAL collector against a REAL planned variable
	// set rather than grepping for a function-call string.
	test('setupRailway calls the shared production-readiness collector before configuring Railway', () => {
		const railwayBody = source.slice(
			source.indexOf('async function setupRailway()'),
			source.indexOf('async function setupGithubSecrets'),
		);
		expect(railwayBody).toContain('collectRailwayProductionStartupFailures');
	});

	describe('collectRailwayProductionStartupFailures', () => {
		test('reports no failures for a fully valid production configuration', () => {
			const failures = collectRailwayProductionStartupFailures(validProductionVariables(), {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures).toEqual([]);
		});

		// The exact gap the review finding named: setupRailway's three ad hoc checks never looked
		// at Google credentials at all, so a configuration missing them was pushed to Railway and
		// reported as configured, only for the deployed server to refuse to start.
		test('reports a failure when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing', () => {
			const variables = validProductionVariables();
			delete variables.GOOGLE_CLIENT_ID;
			delete variables.GOOGLE_CLIENT_SECRET;
			const failures = collectRailwayProductionStartupFailures(variables, {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures.some((failure) => failure.includes('GOOGLE_CLIENT_ID'))).toBe(true);
		});

		// The other example the review finding named explicitly: a DATABASE_URL rejected only by
		// collectProductionStartupFailures's sslmode=verify-full requirement, not by any of
		// setupRailway's own three checks.
		test('reports a failure when DATABASE_URL uses sslmode=require instead of sslmode=verify-full', () => {
			const variables = validProductionVariables();
			variables.DATABASE_URL = 'postgres://user:pass@db.example.com/db?sslmode=require';
			const failures = collectRailwayProductionStartupFailures(variables, {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures.some((failure) => failure.includes('sslmode=verify-full'))).toBe(true);
		});

		test('reports a failure when SESSION_SIGNING_SECRET is missing', () => {
			const variables = validProductionVariables();
			delete variables.SESSION_SIGNING_SECRET;
			const failures = collectRailwayProductionStartupFailures(variables, {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures.some((failure) => failure.includes('SESSION_SIGNING_SECRET'))).toBe(true);
		});

		// Confirms this validates the PLANNED (post-planRailwayVariables) variable set, not
		// .env.local's raw contents -- DATABASE_LOCAL_PROXY_URL is a real, valid key to have set
		// locally (every developer has it), but planRailwayVariables strips it before pushing to
		// Railway, and collectProductionStartupFailures rejects it if still present in production.
		test('reports no failure for DATABASE_LOCAL_PROXY_URL set locally, since planRailwayVariables strips it', () => {
			const variables = validProductionVariables();
			variables.DATABASE_LOCAL_PROXY_URL = 'http://db.localtest.me:4444/sql';
			const failures = collectRailwayProductionStartupFailures(variables, {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures).toEqual([]);
		});

		// B2 regression: `planRailwayVariables` copies MCP_ALLOWED_ORIGINS to Railway verbatim
		// (the generic .env.local copy has no reason to exclude it), but this collector never
		// passed `mcpAllowedOrigins` into `collectProductionStartupFailures`'s configuration
		// object -- so a value `findInvalidConfiguredOrigins` would reject (a path, not a bare
		// origin) sailed through the gate silently, even though real startup
		// (`startup-invariants.ts`) passes the exact same value and rejects it.
		test('reports a failure when MCP_ALLOWED_ORIGINS contains an entry that is not a canonical Origin', () => {
			const variables = validProductionVariables();
			variables.MCP_ALLOWED_ORIGINS = 'https://claude.ai/callback';
			const failures = collectRailwayProductionStartupFailures(variables, {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures.some((failure) => failure.includes('MCP_ALLOWED_ORIGINS'))).toBe(true);
		});

		test('reports no failure when MCP_ALLOWED_ORIGINS is a valid canonical origin', () => {
			const variables = validProductionVariables();
			variables.MCP_ALLOWED_ORIGINS = 'https://claude.ai';
			const failures = collectRailwayProductionStartupFailures(variables, {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures).toEqual([]);
		});

		// B1 regression: `planRailwayVariables` also copies TRUSTED_PROXY_HOP_COUNT to Railway
		// verbatim when it is present in `.env.local`, but nothing in this collector ever
		// validated it -- the environment schema
		// (`applications/web/src/environment-schema.ts`) requires a positive integer and refuses
		// to boot otherwise, so a value of "0" or a nonnumeric string reached this gate with no
		// signal at all.
		test('reports a failure when TRUSTED_PROXY_HOP_COUNT is zero', () => {
			const variables = validProductionVariables();
			variables.TRUSTED_PROXY_HOP_COUNT = '0';
			const failures = collectRailwayProductionStartupFailures(variables, {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures.some((failure) => failure.includes('TRUSTED_PROXY_HOP_COUNT'))).toBe(true);
		});

		test('reports a failure when TRUSTED_PROXY_HOP_COUNT is nonnumeric', () => {
			const variables = validProductionVariables();
			variables.TRUSTED_PROXY_HOP_COUNT = 'not-a-number';
			const failures = collectRailwayProductionStartupFailures(variables, {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures.some((failure) => failure.includes('TRUSTED_PROXY_HOP_COUNT'))).toBe(true);
		});

		test('reports no failure when TRUSTED_PROXY_HOP_COUNT is a valid positive integer', () => {
			const variables = validProductionVariables();
			variables.TRUSTED_PROXY_HOP_COUNT = '2';
			const failures = collectRailwayProductionStartupFailures(variables, {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures).toEqual([]);
		});

		test('reports no failure when TRUSTED_PROXY_HOP_COUNT is unset (optional, defaults at boot)', () => {
			const failures = collectRailwayProductionStartupFailures(validProductionVariables(), {
				REDIS_URL: 'rediss://production-host.example.com:6380',
			});
			expect(failures).toEqual([]);
		});
	});

	// Class-level regression: B1 and B2 were both instances of the same defect -- a planned
	// production variable (`MCP_ALLOWED_ORIGINS`, `TRUSTED_PROXY_HOP_COUNT`) that
	// `planRailwayVariables` copies to Railway, but that `collectRailwayProductionStartupFailures`
	// never validated because the argument object it hand-builds for
	// `collectProductionStartupFailures` simply omitted the corresponding field. Two prior rounds
	// patched this same omission for other fields (BASE_URL, TRUSTED_PROXY_CIDRS/HEADER,
	// REDIS_URL). Rather than trusting the next reviewer to notice a fourth omission by eye, this
	// reads BOTH source files and mechanically confirms every field
	// `ProductionStartupConfiguration` (the shared, single source of truth this gate is supposed
	// to enforce in full -- production-startup-requirements.ts) declares is actually referenced
	// by name inside `collectRailwayProductionStartupFailures`'s call to
	// `collectProductionStartupFailures`. A future field added to that interface (as
	// `mcpAllowedOrigins` was in round 16) and never wired into this call fails this test
	// immediately, instead of silently reopening the same gate-omission bug class.
	test('every ProductionStartupConfiguration field is wired into collectRailwayProductionStartupFailures', () => {
		const requirementsSource = readFileSync(
			new URL('../applications/web/src/lib/production-startup-requirements.ts', import.meta.url),
			'utf8',
		);
		const interfaceBody = requirementsSource.slice(
			requirementsSource.indexOf('export interface ProductionStartupConfiguration {'),
			requirementsSource.indexOf('export function collectProductionStartupFailures('),
		);
		// Field declarations look like `fieldName: type;` or `fieldName?: type;` at the top level
		// of the interface -- this intentionally only matches lines that start a declaration
		// (leading whitespace then an identifier then optional `?` then `:`), so it does not
		// false-match property names mentioned inside doc comments above each field.
		const fieldNames = [...interfaceBody.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\??:\s/gm)].map(
			(match) => match[1],
		);
		expect(fieldNames.length).toBeGreaterThan(0);

		const setupSource = readFileSync(new URL('./setup.ts', import.meta.url), 'utf8');
		const callBody = setupSource.slice(
			setupSource.indexOf('collectProductionStartupFailures({'),
			setupSource.indexOf('});', setupSource.indexOf('collectProductionStartupFailures({')),
		);

		const missingFields = fieldNames.filter((field) => !callBody.includes(`${field}:`));
		expect(missingFields).toEqual([]);
	});
});

describe('Google OAuth callback instructions', () => {
	// Regression for a bot-reported P1: the printed redirect URI (/api/auth/callback/google)
	// did not match what the router and both token-exchange call sites actually serve
	// (/auth/google/callback — application.ts's route table and google-authentication.ts's
	// callbackUrl at both the authorization-request and code-exchange steps). Google requires an
	// exact registered redirect URI, so following the old instructions produced credentials that
	// could never complete sign-in.
	const source = readFileSync(new URL('./setup.ts', import.meta.url), 'utf8');
	const setupGoogleBody = source.slice(
		source.indexOf('async function setupGoogle()'),
		source.indexOf('async function setupEnvironmentMode()'),
	);

	test('prints the callback path the application actually serves, not /api/auth/callback/google', () => {
		expect(setupGoogleBody).toContain(
			"console.log('  https://your-app.up.railway.app/auth/google/callback');",
		);
		// The old, wrong path may still appear in an explanatory code comment (as it does here,
		// documenting the fix) — only the printed console.log instructions matter to the operator.
		const printedLines = setupGoogleBody
			.split('\n')
			.filter((line) => line.trim().startsWith('console.log('));
		expect(printedLines.some((line) => line.includes('/api/auth/callback/google'))).toBe(false);
	});

	test('includes a localhost redirect URI for development setup', () => {
		expect(setupGoogleBody).toContain('http://localhost:3000/auth/google/callback');
	});
});

describe('GitHub CI/CD secrets phase requires NEON_API_KEY and RAILWAY_TOKEN', () => {
	// Regression for two bot-reported P1s: the previous "blank to skip" NEON_API_KEY undersold the
	// consequence (production.yml's mandatory pre-migration rollback-branch snapshot needs it, not
	// only the PR workflow), and RAILWAY_TOKEN was never collected anywhere even though
	// production.yml's deploy job authenticates exclusively with it on a GitHub-hosted runner with
	// no other login path.
	const source = readFileSync(new URL('./setup.ts', import.meta.url), 'utf8');
	const setupGithubSecretsBody = source.slice(
		source.indexOf('async function setupGithubSecrets('),
		source.indexOf('async function runInitialMigration'),
	);

	test('requires NEON_API_KEY (no skip path)', () => {
		expect(setupGithubSecretsBody).toContain("setGithubSecret('NEON_API_KEY', neonApiKey)");
		expect(setupGithubSecretsBody).not.toContain('blank to skip');
	});

	test('collects and stores RAILWAY_TOKEN', () => {
		expect(setupGithubSecretsBody).toContain("setGithubSecret('RAILWAY_TOKEN', railwayToken)");
	});

	// Regression for a bot-reported P2: `MANAGED_GITHUB_SECRETS` (the single list `doctor`,
	// `teardown`, and `rotate-secret` all read) names `SESSION_SIGNING_SECRET` as a managed secret,
	// but this phase never pushed it -- so `gh secret list` never showed all six managed secrets
	// after a full wizard run, contradicting `DEPLOYMENT-RUNBOOK.md`'s documented "it worked" check.
	test('pushes the SESSION_SIGNING_SECRET already generated by the session phase', () => {
		expect(setupGithubSecretsBody).toContain("getEnvironmentValue('SESSION_SIGNING_SECRET')");
		expect(setupGithubSecretsBody).toContain(
			"setGithubSecret('SESSION_SIGNING_SECRET', sessionSigningSecret)",
		);
	});
});

describe('applyPlannedRailwayVariables', () => {
	// B5 regression: `setupRailway` previously caught each `railway variable set` failure inline,
	// printed a warning, and kept going -- the loop always finished and the unconditional success
	// message printed afterward, even when a required value (SESSION_SIGNING_SECRET, DATABASE_URL,
	// NODE_ENV, ...) failed to set. This is the extracted, pure decision logic: which keys failed,
	// reported by NAME ONLY -- never a value, since these scripts handle secrets.
	test('returns no failed keys when every setVariable call succeeds', () => {
		const applied: Array<[string, string]> = [];
		const failedKeys = applyPlannedRailwayVariables(
			[
				['NODE_ENV', 'production'],
				['DATABASE_URL', 'postgres://x'],
			],
			(key, value) => {
				applied.push([key, value]);
			},
		);
		expect(failedKeys).toEqual([]);
		expect(applied).toEqual([
			['NODE_ENV', 'production'],
			['DATABASE_URL', 'postgres://x'],
		]);
	});

	test('collects the key names (never the values) for every setVariable call that throws', () => {
		const failedKeys = applyPlannedRailwayVariables(
			[
				['NODE_ENV', 'production'],
				['SESSION_SIGNING_SECRET', 'super-secret-value'],
				['DATABASE_URL', 'postgres://x'],
			],
			(key) => {
				if (key === 'SESSION_SIGNING_SECRET') throw new Error('railway CLI failed');
			},
		);
		expect(failedKeys).toEqual(['SESSION_SIGNING_SECRET']);
	});

	test('keeps attempting every remaining key after one fails, rather than stopping early', () => {
		const attempted: string[] = [];
		const failedKeys = applyPlannedRailwayVariables(
			[
				['A', '1'],
				['B', '2'],
				['C', '3'],
			],
			(key) => {
				attempted.push(key);
				if (key === 'B') throw new Error('transient failure');
			},
		);
		expect(attempted).toEqual(['A', 'B', 'C']);
		expect(failedKeys).toEqual(['B']);
	});
});

describe('setupRailway fails the phase when any Railway variable fails to set', () => {
	// B5 regression, source-inspection half: `setupRailway` itself is unexported, interactive, and
	// side-effecting (it shells out to the real `railway` CLI), so — matching this file's existing
	// convention for that class of function (see the BASE_URL/TRUSTED_PROXY_* phase-ordering tests
	// above) — this reads the real source rather than re-implementing the function, to confirm the
	// unconditional success message from before the fix cannot be reached without checking
	// `applyPlannedRailwayVariables`'s result first.
	const source = readFileSync(new URL('./setup.ts', import.meta.url), 'utf8');
	const railwayBody = source.slice(
		source.indexOf('async function setupRailway()'),
		source.indexOf('async function setupGithubSecrets'),
	);

	test('uses applyPlannedRailwayVariables rather than swallowing each failure inline', () => {
		expect(railwayBody).toContain('applyPlannedRailwayVariables(');
	});

	test('checks for failed keys and sets process.exitCode before the success message can print', () => {
		const failedKeysCheckIndex = railwayBody.indexOf('failedKeys.length > 0');
		const successMessageIndex = railwayBody.indexOf(
			"'Railway environment variables configured (NODE_ENV forced to production).'",
		);
		expect(failedKeysCheckIndex).toBeGreaterThan(-1);
		expect(successMessageIndex).toBeGreaterThan(-1);
		expect(failedKeysCheckIndex).toBeLessThan(successMessageIndex);

		const failureBranch = railwayBody.slice(
			failedKeysCheckIndex,
			railwayBody.indexOf('return;', failedKeysCheckIndex) + 'return;'.length,
		);
		expect(failureBranch).toContain('process.exitCode = 1');
		expect(failureBranch).toContain('return;');
	});
});

describe('setupRailway fails the phase when railway init itself fails', () => {
	// B5 sibling: the outer catch around `railway init` (a failure before any variable-set call is
	// even attempted) used to only `console.warn` and let the function return normally — exit code
	// 0 — despite Railway never having been configured. Same "phase must fail, not report success"
	// shape as the variable-set failures the source B5 report named.
	const source = readFileSync(new URL('./setup.ts', import.meta.url), 'utf8');
	const railwayBody = source.slice(
		source.indexOf('async function setupRailway()'),
		source.indexOf('async function setupGithubSecrets'),
	);

	test('sets process.exitCode when railway init fails', () => {
		const outerCatchIndex = railwayBody.lastIndexOf('} catch {');
		expect(outerCatchIndex).toBeGreaterThan(-1);
		const outerCatchBody = railwayBody.slice(outerCatchIndex);
		expect(outerCatchBody).toContain('process.exitCode = 1');
	});
});
