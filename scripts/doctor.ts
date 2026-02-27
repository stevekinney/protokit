import { existsSync } from 'node:fs';

import {
	commandExists,
	execute,
	readEnvironmentFile,
	ENVIRONMENT_FILE_PATH,
	MANAGED_GITHUB_SECRETS,
} from './utilities.ts';

type Status = 'pass' | 'fail' | 'warn' | 'skip';

const SYMBOLS: Record<Status, string> = {
	pass: '\x1b[32m✓\x1b[0m',
	fail: '\x1b[31m✗\x1b[0m',
	warn: '\x1b[33m!\x1b[0m',
	skip: '\x1b[90m-\x1b[0m',
};

let failures = 0;
let warnings = 0;

function report(status: Status, label: string, detail: string) {
	console.log(`  ${SYMBOLS[status]} ${label}: ${detail}`);
	if (status === 'fail') failures++;
	if (status === 'warn') warnings++;
}

function checkCliAvailability() {
	for (const command of ['neonctl', 'railway', 'gh']) {
		if (commandExists(command)) {
			report('pass', command, 'Installed');
		} else {
			report('warn', command, 'Not installed');
		}
	}
}

function checkEnvironmentFile(): Record<string, string> {
	if (!existsSync(ENVIRONMENT_FILE_PATH)) {
		report('fail', '.env.local', 'Not found');
		return {};
	}

	const variables = readEnvironmentFile();
	const count = Object.keys(variables).length;
	report('pass', '.env.local', `Found (${count} variable${count === 1 ? '' : 's'})`);
	return variables;
}

function checkRequiredVariables(variables: Record<string, string>) {
	const required = ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'NEON_AUTH_URL'];

	for (const key of required) {
		if (variables[key]) {
			report('pass', key, 'Set');
		} else {
			report('fail', key, 'Not set');
		}
	}
}

async function checkDatabaseConnection(variables: Record<string, string>) {
	const databaseUrl = variables['DATABASE_URL'];

	if (!databaseUrl) {
		report('skip', 'Database connection', 'No DATABASE_URL configured');
		return;
	}

	try {
		const { neon } = await import('@neondatabase/serverless');
		const sql = neon(databaseUrl);
		await sql`SELECT 1`;
		report('pass', 'Database connection', 'Connected successfully');
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		report('fail', 'Database connection', `Failed (${message})`);
	}
}

async function checkNeonAuthUrl(variables: Record<string, string>) {
	const neonAuthUrl = variables['NEON_AUTH_URL'];

	if (!neonAuthUrl) {
		report('skip', 'Neon Auth URL', 'Not configured');
		return;
	}

	try {
		const response = await fetch(neonAuthUrl, { method: 'HEAD' });
		report('pass', 'Neon Auth URL', `Reachable (${response.status})`);
	} catch {
		report('fail', 'Neon Auth URL', 'Unreachable');
	}
}

function checkGithubAuthentication() {
	if (!commandExists('gh')) {
		report('skip', 'GitHub authentication', 'gh not installed');
		return;
	}

	try {
		execute('gh auth status');
		report('pass', 'GitHub authentication', 'Authenticated');
	} catch {
		report('warn', 'GitHub authentication', 'Not authenticated');
	}
}

function checkGithubSecrets() {
	if (!commandExists('gh')) {
		report('skip', 'GitHub secrets', 'gh not installed');
		return;
	}

	let secretList: string;
	try {
		secretList = execute('gh secret list');
	} catch {
		report('warn', 'GitHub secrets', 'Could not list secrets (not authenticated or no repo)');
		return;
	}

	for (const secret of MANAGED_GITHUB_SECRETS) {
		if (secretList.includes(secret)) {
			report('pass', `GitHub secret: ${secret}`, 'Set');
		} else {
			report('warn', `GitHub secret: ${secret}`, 'Not set');
		}
	}
}

function checkRailwayLinked() {
	if (!commandExists('railway')) {
		report('skip', 'Railway project', 'railway not installed');
		return;
	}

	try {
		execute('railway status');
		report('pass', 'Railway project', 'Linked');
	} catch {
		report('warn', 'Railway project', 'Not linked');
	}
}

async function runNeonChecks(variables: Record<string, string>) {
	checkRequiredVariables(variables);
	await checkDatabaseConnection(variables);
	await checkNeonAuthUrl(variables);
}

async function runGithubChecks() {
	checkGithubAuthentication();
	checkGithubSecrets();
}

async function runRailwayChecks() {
	checkRailwayLinked();
}

async function runAllChecks() {
	const variables = checkEnvironmentFile();
	checkCliAvailability();
	checkRequiredVariables(variables);
	await checkDatabaseConnection(variables);
	await checkNeonAuthUrl(variables);
	checkGithubAuthentication();
	checkGithubSecrets();
	checkRailwayLinked();
}

async function main() {
	console.log('\n=== Doctor: Health Check ===\n');

	const subcommand = process.argv[2];

	if (subcommand) {
		const variables = checkEnvironmentFile();

		const checks: Record<string, () => Promise<void>> = {
			neon: () => runNeonChecks(variables),
			github: () => runGithubChecks(),
			railway: () => runRailwayChecks(),
		};

		const check = checks[subcommand];

		if (!check) {
			console.error(`Unknown check: ${subcommand}`);
			console.error(`Available checks: ${Object.keys(checks).join(', ')}`);
			process.exit(1);
		}

		await check();
	} else {
		await runAllChecks();
	}

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

main();
