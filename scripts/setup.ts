import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

import {
	commandExists,
	execute,
	appendToEnvironmentFile,
	getEnvironmentValue,
	prompt,
	confirm,
	ENVIRONMENT_FILE_PATH,
	ROOT_DIRECTORY,
} from './utilities.ts';

function setGithubSecret(name: string, value: string) {
	execSync(`gh secret set ${name}`, {
		input: value,
		stdio: ['pipe', 'pipe', 'pipe'],
		cwd: ROOT_DIRECTORY,
	});
}

function checkPrerequisites(commands: string[]) {
	const missing = commands.filter((command) => !commandExists(command));

	if (missing.length > 0) {
		console.error(`Missing required CLIs: ${missing.join(', ')}`);
		console.error('Install them before running setup:');
		if (missing.includes('neonctl')) console.error('  neonctl: npm install -g neonctl');
		if (missing.includes('railway')) console.error('  railway: npm install -g @railway/cli');
		if (missing.includes('gh')) console.error('  gh: https://cli.github.com/');
		process.exit(1);
	}
}

async function setupNeon(): Promise<
	{ projectId: string; connectionString: string; directConnectionString: string } | undefined
> {
	console.log('\n--- Neon ---\n');

	if (!commandExists('neonctl')) {
		console.error('neonctl is not installed. Install it with: npm install -g neonctl');
		process.exit(1);
	}

	const existingDatabaseUrl = getEnvironmentValue('DATABASE_URL');

	if (existingDatabaseUrl) {
		console.log('DATABASE_URL already exists in .env.local.');
		const createNew = await confirm('Create a new Neon project anyway? (y/N): ');
		if (!createNew) {
			console.log('Keeping existing configuration.');
			return undefined;
		}
	}

	const region = (await prompt('Neon region (default: aws-us-east-2): ')) || 'aws-us-east-2';

	let neonProjectId: string;
	try {
		const output = execute(`neonctl projects create --region-id ${region} --output json`);
		const project = JSON.parse(output);
		neonProjectId = project.project.id;
		console.log(`Created Neon project: ${neonProjectId}`);
	} catch {
		console.error('Failed to create Neon project. Make sure you are logged in: neonctl auth');
		process.exit(1);
		return; // unreachable, satisfies TypeScript control flow
	}

	const connectionString = execute(
		`neonctl connection-string --project-id ${neonProjectId} --pooled`,
	);
	const directConnectionString = execute(`neonctl connection-string --project-id ${neonProjectId}`);

	appendToEnvironmentFile('DATABASE_URL', connectionString);
	appendToEnvironmentFile('DATABASE_URL_UNPOOLED', directConnectionString);
	console.log('Database URLs written to .env.local');

	// Enable Neon Auth
	console.log('Enabling Neon Auth...');
	try {
		execute(`neonctl auth enable --project-id ${neonProjectId}`);
		const neonAuthUrl = execute(`neonctl auth url --project-id ${neonProjectId}`);
		appendToEnvironmentFile('NEON_AUTH_URL', neonAuthUrl);
		console.log('Neon Auth enabled. URL written to .env.local');
		console.log('Google login works immediately with Neon shared dev credentials.');
	} catch {
		console.warn('Could not enable Neon Auth automatically.');
		console.warn('Enable it manually in the Neon dashboard and add NEON_AUTH_URL to .env.local');
	}

	return { projectId: neonProjectId, connectionString, directConnectionString };
}

async function setupGoogle() {
	console.log('\n--- Google OAuth ---\n');

	const shouldConfigure = await confirm('Configure production Google OAuth credentials? (y/N): ');
	if (!shouldConfigure) return;

	console.log('\nOpen Google Cloud Console: https://console.cloud.google.com/apis/credentials');
	console.log('Create OAuth 2.0 Client ID with redirect URI:');
	console.log('  https://your-app.railway.app/api/auth/callback/google\n');

	const googleClientId = await prompt('GOOGLE_CLIENT_ID: ');
	const googleClientSecret = await prompt('GOOGLE_CLIENT_SECRET: ');

	if (googleClientId && googleClientSecret) {
		appendToEnvironmentFile('GOOGLE_CLIENT_ID', googleClientId);
		appendToEnvironmentFile('GOOGLE_CLIENT_SECRET', googleClientSecret);
		console.log('Google OAuth credentials written to .env.local');
	}
}

async function setupRailway() {
	console.log('\n--- Railway ---\n');

	if (!commandExists('railway')) {
		console.error('railway CLI is not installed. Install it with: npm install -g @railway/cli');
		process.exit(1);
	}

	const shouldConfigure = await confirm('Configure Railway deployment? (y/N): ');
	if (!shouldConfigure) return;

	console.log('\nInitializing Railway project...');
	try {
		execute('railway init -y', { stdio: 'inherit' });

		if (existsSync(ENVIRONMENT_FILE_PATH)) {
			const envContent = readFileSync(ENVIRONMENT_FILE_PATH, 'utf-8');
			const envLines = envContent
				.split('\n')
				.filter((line) => line.includes('=') && !line.startsWith('#'));

			for (const line of envLines) {
				const [key, ...valueParts] = line.split('=');
				const value = valueParts.join('=');
				if (key && value) {
					try {
						execute(`railway variable set ${key}="${value}"`);
					} catch {
						console.warn(`  Failed to set ${key} on Railway`);
					}
				}
			}
			console.log('Railway environment variables configured.');
		}
	} catch {
		console.warn('Railway setup failed. Configure manually with: railway init');
	}
}

async function setupGithubSecrets(neonProjectId?: string) {
	console.log('\n--- GitHub Secrets ---\n');

	if (!commandExists('gh')) {
		console.error('gh CLI is not installed. Install it from: https://cli.github.com/');
		process.exit(1);
	}

	const shouldConfigure = await confirm('Set GitHub secrets for CI/CD? (y/N): ');
	if (!shouldConfigure) return;

	const connectionString = neonProjectId
		? execute(`neonctl connection-string --project-id ${neonProjectId} --pooled`)
		: getEnvironmentValue('DATABASE_URL');

	const directConnectionString = neonProjectId
		? execute(`neonctl connection-string --project-id ${neonProjectId}`)
		: getEnvironmentValue('DATABASE_URL_UNPOOLED');

	if (!connectionString || !directConnectionString) {
		console.error('DATABASE_URL and DATABASE_URL_UNPOOLED are required.');
		console.error('Run the Neon setup phase first, or add them to .env.local manually.');
		return;
	}

	const projectId = neonProjectId || (await prompt('NEON_PROJECT_ID: '));

	if (!projectId) {
		console.error('Neon project ID is required for GitHub secrets.');
		return;
	}

	try {
		setGithubSecret('NEON_PROJECT_ID', projectId);
		setGithubSecret('DATABASE_URL', connectionString);
		setGithubSecret('DATABASE_URL_UNPOOLED', directConnectionString);
		setGithubSecret('SKIP_ENV_VALIDATION', 'true');

		const neonApiKey = await prompt(
			'NEON_API_KEY (for PR workflow Neon branch creation, blank to skip): ',
		);

		if (neonApiKey) {
			setGithubSecret('NEON_API_KEY', neonApiKey);
		} else {
			console.warn(
				'Skipping NEON_API_KEY — PR database validation workflow will not work without it.',
			);
		}

		console.log('GitHub secrets configured.');
	} catch {
		console.warn('Failed to set GitHub secrets. Make sure gh is authenticated.');
	}
}

async function runInitialMigration() {
	console.log('\n--- Migration ---\n');
	console.log('Running initial migration...');
	try {
		execute('bun scripts/migrate.ts', { stdio: 'inherit' });
	} catch {
		console.warn('Migration failed. Run manually: bun scripts/migrate.ts');
	}
}

async function runFullSetup() {
	console.log('\n=== SvelteKit MCP Template Setup ===\n');

	console.log('Checking prerequisites...');
	checkPrerequisites(['neonctl', 'railway', 'gh']);
	console.log('All prerequisites found.');

	const neonResult = await setupNeon();
	await setupGoogle();

	appendToEnvironmentFile('PUBLIC_APP_URL', 'http://localhost:3000');

	await setupRailway();
	await setupGithubSecrets(neonResult?.projectId);
	await runInitialMigration();

	console.log('\n=== Setup Complete ===');
	console.log('');
	console.log('Next steps:');
	console.log('  1. bun turbo dev         — Start development server');
	console.log('  2. bunx cloudflared tunnel --url http://localhost:3000/mcp');
	console.log('                           — Expose MCP endpoint for claude.ai');
	console.log('  3. bunx @modelcontextprotocol/inspector');
	console.log('                           — Debug MCP locally');
	console.log('');
}

const subcommand = process.argv[2];

const phases: Record<string, () => Promise<void>> = {
	neon: async () => {
		await setupNeon();
	},
	google: async () => {
		await setupGoogle();
	},
	railway: async () => {
		await setupRailway();
	},
	github: async () => {
		await setupGithubSecrets();
	},
	migration: async () => {
		await runInitialMigration();
	},
};

if (subcommand) {
	const phase = phases[subcommand];
	if (!phase) {
		console.error(`Unknown phase: ${subcommand}`);
		console.error(`Available phases: ${Object.keys(phases).join(', ')}`);
		process.exit(1);
	}
	await phase();
} else {
	await runFullSetup();
}
