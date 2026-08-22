import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'bun:test';
import {
	isValidNeonRegionIdentifier,
	isValidProductionBaseUrl,
	planRailwayVariables,
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
