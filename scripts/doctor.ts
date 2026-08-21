import { existsSync } from 'node:fs';
import { z } from 'zod';

import { databaseServerEnvironmentSchema } from '@template/database/environment-schema';
import { mcpServerEnvironmentSchema } from '@template/mcp/environment-schema';
import { webServerEnvironmentSchema } from '@template/web/environment-schema';
import { collectProductionStartupFailures } from '@template/web/lib/production-startup-requirements';

import {
	commandExists,
	execute,
	readEnvironmentFile,
	ENVIRONMENT_FILE_PATH,
	MANAGED_GITHUB_SECRETS,
} from './utilities.ts';

export type Status = 'pass' | 'fail' | 'warn' | 'skip';
export type Target = 'development' | 'production';
export type CandidateVariables = Record<string, string | undefined>;

export interface CheckResult {
	status: Status;
	label: string;
	detail: string;
	group: string;
}

const SYMBOLS: Record<Status, string> = {
	pass: '\x1b[32m✓\x1b[0m',
	fail: '\x1b[31m✗\x1b[0m',
	warn: '\x1b[33m!\x1b[0m',
	skip: '\x1b[90m-\x1b[0m',
};

function makeResult(group: string, status: Status, label: string, detail: string): CheckResult {
	return { status, label, detail, group };
}

/**
 * Every variable named by `.env.local`, overlaid with the real process
 * environment (so `bun run doctor --production` also works against a real
 * deployment shell — a Railway service, a CI job, a container — that sets
 * variables directly rather than through a file).
 */
export function loadCandidateVariables(): CandidateVariables {
	const merged: CandidateVariables = { ...readEnvironmentFile() };
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) merged[key] = value;
	}

	// Match every `env.ts`'s `emptyStringAsUndefined: true`: a `KEY=` line (or
	// an exported-but-empty shell variable) means "unset," not "the empty
	// string" — otherwise doctor would fail a field the real server treats as
	// absent, or infer a target from an empty NODE_ENV instead of falling
	// back to development the way the real schema does.
	const variables: CandidateVariables = {};
	for (const [key, value] of Object.entries(merged)) {
		variables[key] = value === '' ? undefined : value;
	}
	return variables;
}

/**
 * Validates every field of a package's environment schema against the
 * candidate variables and returns one result per invalid or missing field
 * plus a summary line — nothing about which fields exist, which are
 * required, or what makes a value valid is hardcoded here. Adding,
 * removing, or tightening a field in the package's `environment-schema.ts`
 * changes this report automatically. Never includes the offending value,
 * only Zod's constraint-description message.
 */
export function evaluateEnvironmentSchema(
	label: string,
	shape: Record<string, z.ZodTypeAny>,
	variables: CandidateVariables,
): CheckResult[] {
	const schema = z.object(shape);
	const input: CandidateVariables = {};
	for (const key of Object.keys(shape)) {
		input[key] = variables[key];
	}

	const parsed = schema.safeParse(input);

	if (parsed.success) {
		return [makeResult(label, 'pass', label, `${Object.keys(shape).length} variable(s) valid`)];
	}

	const messagesByField = new Map<string, string[]>();
	for (const issue of parsed.error.issues) {
		const field = String(issue.path[0] ?? '(schema)');
		const list = messagesByField.get(field) ?? [];
		list.push(issue.message);
		messagesByField.set(field, list);
	}

	const results: CheckResult[] = [];
	for (const [field, messages] of messagesByField) {
		results.push(makeResult(label, 'fail', field, messages.join('; ')));
	}

	const validCount = Object.keys(shape).length - messagesByField.size;
	if (validCount > 0) {
		results.push(makeResult(label, 'pass', label, `${validCount} other variable(s) valid`));
	}

	return results;
}

export function evaluateEnvironmentSchemas(variables: CandidateVariables): CheckResult[] {
	return [
		...evaluateEnvironmentSchema('@template/database', databaseServerEnvironmentSchema, variables),
		...evaluateEnvironmentSchema('@template/mcp', mcpServerEnvironmentSchema, variables),
		...evaluateEnvironmentSchema('@template/web', webServerEnvironmentSchema, variables),
	];
}

/**
 * Evaluates the same fail-closed production invariants `server.ts` enforces
 * before it starts accepting traffic — via the identical, pure
 * `collectProductionStartupFailures` function `startup-invariants.ts` uses,
 * not a restatement of it. Only runs for the `production` target: these
 * checks (an HTTPS `BASE_URL`, an encrypted non-local Redis, an encrypted
 * non-local database, paired Google credentials, trusted-proxy
 * configuration) are development-optional by design.
 */
export function evaluateProductionReadiness(
	target: Target,
	variables: CandidateVariables,
): CheckResult[] {
	if (target !== 'production') return [];

	if (!variables.DATABASE_URL) {
		return [
			makeResult(
				'Production readiness',
				'skip',
				'Production startup invariants',
				'DATABASE_URL is not set — fix the environment schema failures above first',
			),
		];
	}

	const failureMessages = collectProductionStartupFailures({
		nodeEnvironment: variables.NODE_ENV ?? '(not set)',
		baseUrl: variables.BASE_URL,
		redisUrl: variables.REDIS_URL,
		isRedisConfigured: variables.REDIS_URL !== undefined,
		databaseUrl: variables.DATABASE_URL,
		databaseUrlUnpooled: variables.DATABASE_URL_UNPOOLED,
		databaseLocalProxyUrl: variables.DATABASE_LOCAL_PROXY_URL,
		googleClientId: variables.GOOGLE_CLIENT_ID,
		googleClientSecret: variables.GOOGLE_CLIENT_SECRET,
		trustedProxyCidrs: variables.TRUSTED_PROXY_CIDRS,
		trustedProxyHeader: variables.TRUSTED_PROXY_HEADER,
		nodeTlsRejectUnauthorized: variables.NODE_TLS_REJECT_UNAUTHORIZED,
	});

	if (failureMessages.length === 0) {
		return [
			makeResult('Production readiness', 'pass', 'Production startup invariants', 'All satisfied'),
		];
	}

	return failureMessages.map((message) =>
		makeResult('Production readiness', 'fail', 'Production startup invariant', message),
	);
}

export function evaluateCliAvailability(): CheckResult[] {
	return ['neonctl', 'railway', 'gh'].map((command) =>
		commandExists(command)
			? makeResult('CLI availability', 'pass', command, 'Installed')
			: makeResult('CLI availability', 'warn', command, 'Not installed'),
	);
}

export function evaluateEnvironmentFile(): CheckResult[] {
	if (!existsSync(ENVIRONMENT_FILE_PATH)) {
		return [
			makeResult(
				'Environment file',
				'warn',
				'.env.local',
				'Not found (relying on the real process environment)',
			),
		];
	}

	const variables = readEnvironmentFile();
	const count = Object.keys(variables).length;
	return [
		makeResult(
			'Environment file',
			'pass',
			'.env.local',
			`Found (${count} variable${count === 1 ? '' : 's'})`,
		),
	];
}

export async function evaluateDatabaseConnection(
	variables: CandidateVariables,
): Promise<CheckResult[]> {
	const databaseUrl = variables.DATABASE_URL;

	if (!databaseUrl) {
		return [
			makeResult(
				'Database connection',
				'skip',
				'Database connection',
				'No DATABASE_URL configured',
			),
		];
	}

	try {
		const { neon } = await import('@neondatabase/serverless');
		const sql = neon(databaseUrl);
		await sql`SELECT 1`;
		return [
			makeResult('Database connection', 'pass', 'Database connection', 'Connected successfully'),
		];
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return [
			makeResult('Database connection', 'fail', 'Database connection', `Failed (${message})`),
		];
	}
}

export function evaluateGithubAuthentication(): CheckResult[] {
	if (!commandExists('gh')) {
		return [makeResult('GitHub', 'skip', 'GitHub authentication', 'gh not installed')];
	}

	try {
		execute('gh', ['auth', 'status']);
		return [makeResult('GitHub', 'pass', 'GitHub authentication', 'Authenticated')];
	} catch {
		return [makeResult('GitHub', 'warn', 'GitHub authentication', 'Not authenticated')];
	}
}

export function evaluateGithubSecrets(): CheckResult[] {
	if (!commandExists('gh')) {
		return [makeResult('GitHub', 'skip', 'GitHub secrets', 'gh not installed')];
	}

	let secretList: string;
	try {
		secretList = execute('gh', ['secret', 'list']);
	} catch {
		return [
			makeResult(
				'GitHub',
				'warn',
				'GitHub secrets',
				'Could not list secrets (not authenticated or no repo)',
			),
		];
	}

	return MANAGED_GITHUB_SECRETS.map((secret) =>
		secretList.includes(secret)
			? makeResult('GitHub', 'pass', `GitHub secret: ${secret}`, 'Set')
			: makeResult('GitHub', 'warn', `GitHub secret: ${secret}`, 'Not set'),
	);
}

export function evaluateRailwayLinked(): CheckResult[] {
	if (!commandExists('railway')) {
		return [makeResult('Railway', 'skip', 'Railway project', 'railway not installed')];
	}

	try {
		execute('railway', ['status']);
		return [makeResult('Railway', 'pass', 'Railway project', 'Linked')];
	} catch {
		return [makeResult('Railway', 'warn', 'Railway project', 'Not linked')];
	}
}

async function runNeonChecks(
	target: Target,
	variables: CandidateVariables,
): Promise<CheckResult[]> {
	return [
		...evaluateEnvironmentSchemas(variables),
		...evaluateProductionReadiness(target, variables),
		...(await evaluateDatabaseConnection(variables)),
	];
}

function runGithubChecks(): CheckResult[] {
	return [...evaluateGithubAuthentication(), ...evaluateGithubSecrets()];
}

function runRailwayChecks(): CheckResult[] {
	return evaluateRailwayLinked();
}

async function runAllChecks(target: Target, variables: CandidateVariables): Promise<CheckResult[]> {
	return [
		...evaluateEnvironmentFile(),
		...evaluateCliAvailability(),
		...evaluateEnvironmentSchemas(variables),
		...evaluateProductionReadiness(target, variables),
		...(await evaluateDatabaseConnection(variables)),
		...evaluateGithubAuthentication(),
		...evaluateGithubSecrets(),
		...evaluateRailwayLinked(),
	];
}

export function parseArguments(argv: readonly string[]): {
	target: Target | null;
	subcommand: string | undefined;
} {
	let target: Target | null = null;
	const rest: string[] = [];

	for (const argument of argv) {
		if (argument === '--production' || argument === '--target=production') {
			target = 'production';
		} else if (argument === '--development' || argument === '--target=development') {
			target = 'development';
		} else {
			rest.push(argument);
		}
	}

	return { target, subcommand: rest[0] };
}

/** With no explicit `--production`/`--development` flag, infer the target from `NODE_ENV` — the same variable that decides it for the running server. */
export function resolveTarget(
	requestedTarget: Target | null,
	variables: CandidateVariables,
): Target {
	return requestedTarget ?? (variables.NODE_ENV === 'production' ? 'production' : 'development');
}

export function summarize(results: readonly CheckResult[]): { failures: number; warnings: number } {
	let failures = 0;
	let warnings = 0;
	for (const entry of results) {
		if (entry.status === 'fail') failures++;
		if (entry.status === 'warn') warnings++;
	}
	return { failures, warnings };
}

function printResults(results: readonly CheckResult[]) {
	let currentGroup: string | null = null;
	for (const entry of results) {
		if (entry.group !== currentGroup) {
			console.log(`\n${entry.group}`);
			currentGroup = entry.group;
		}
		console.log(`  ${SYMBOLS[entry.status]} ${entry.label}: ${entry.detail}`);
	}
}

async function main() {
	const { target: requestedTarget, subcommand } = parseArguments(process.argv.slice(2));
	const variables = loadCandidateVariables();
	const target = resolveTarget(requestedTarget, variables);

	console.log(`\n=== Doctor: Health Check (target: ${target}) ===`);

	let results: CheckResult[];

	if (subcommand) {
		const checks: Record<string, () => Promise<CheckResult[]> | CheckResult[]> = {
			neon: () => runNeonChecks(target, variables),
			github: () => runGithubChecks(),
			railway: () => runRailwayChecks(),
		};

		const check = checks[subcommand];

		if (!check) {
			console.error(`Unknown check: ${subcommand}`);
			console.error(`Available checks: ${Object.keys(checks).join(', ')}`);
			process.exit(1);
		}

		results = await check();
	} else {
		results = await runAllChecks(target, variables);
	}

	printResults(results);

	const { failures, warnings } = summarize(results);

	console.log('');

	if (failures > 0) {
		console.log(`${failures} failure(s), ${warnings} warning(s).`);
		process.exit(1);
	} else if (warnings > 0) {
		console.log(`${warnings} warning(s).`);
	} else {
		console.log('All checks passed.');
	}
}

if (import.meta.main) {
	main();
}
