import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'bun:test';
import {
	isValidNeonRegionIdentifier,
	isValidProductionBaseUrl,
	isValidProductionRedisUrl,
	isValidTrustedProxyCidr,
	isValidTrustedProxyCidrList,
	planRailwayVariables,
	RAILWAY_EXCLUDED_ENVIRONMENT_KEYS,
} from './setup.ts';

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
});

describe('isValidTrustedProxyCidr / isValidTrustedProxyCidrList', () => {
	// Mirrors isValidCidr (applications/web/src/lib/trusted-proxy.ts) so setup never writes a
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
});

describe('Google OAuth callback instructions', () => {
	// Regression for a bot-reported P1: the printed redirect URI (/api/auth/callback/google)
	// did not match what the router and both token-exchange call sites actually serve
	// (/auth/google/callback — application.tsx's route table and google-authentication.ts's
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
});
