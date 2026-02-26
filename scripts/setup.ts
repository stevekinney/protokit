import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const rootDirectory = join(import.meta.dirname, '..');
const envFilePath = join(rootDirectory, '.env.local');

function commandExists(command: string): boolean {
	try {
		execSync(`which ${command}`, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function execute(command: string, options?: { stdio?: 'inherit' | 'pipe' }): string {
	return execSync(command, {
		encoding: 'utf-8',
		stdio: options?.stdio || 'pipe',
		cwd: rootDirectory,
	}).trim();
}

function appendToEnvFile(key: string, value: string) {
	const line = `${key}=${value}\n`;
	if (existsSync(envFilePath)) {
		const content = readFileSync(envFilePath, 'utf-8');
		if (content.includes(`${key}=`)) {
			const updated = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
			writeFileSync(envFilePath, updated);
			return;
		}
		writeFileSync(envFilePath, content + line);
	} else {
		writeFileSync(envFilePath, line);
	}
}

async function prompt(question: string): Promise<string> {
	const readline = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		readline.question(question, (answer) => {
			readline.close();
			resolve(answer.trim());
		});
	});
}

async function main() {
	console.log('\n=== SvelteKit MCP Template Setup ===\n');

	// Phase 1: Check prerequisites
	console.log('Checking prerequisites...');
	const prerequisites = ['neonctl', 'railway', 'gh'];
	const missingPrerequisites = prerequisites.filter((command) => !commandExists(command));

	if (missingPrerequisites.length > 0) {
		console.error(`Missing required CLIs: ${missingPrerequisites.join(', ')}`);
		console.error('Install them before running setup:');
		if (missingPrerequisites.includes('neonctl')) {
			console.error('  neonctl: npm install -g neonctl');
		}
		if (missingPrerequisites.includes('railway')) {
			console.error('  railway: npm install -g @railway/cli');
		}
		if (missingPrerequisites.includes('gh')) {
			console.error('  gh: https://cli.github.com/');
		}
		process.exit(1);
	}
	console.log('All prerequisites found.\n');

	// Phase 2: Create Neon project
	console.log('Creating Neon project...');
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

	// Get connection strings
	const connectionString = execute(
		`neonctl connection-string --project-id ${neonProjectId} --pooled`,
	);
	const directConnectionString = execute(`neonctl connection-string --project-id ${neonProjectId}`);

	appendToEnvFile('DATABASE_URL', connectionString);
	appendToEnvFile('DATABASE_URL_UNPOOLED', directConnectionString);
	console.log('Database URLs written to .env.local\n');

	// Enable Neon Auth
	console.log('Enabling Neon Auth...');
	try {
		execute(`neonctl auth enable --project-id ${neonProjectId}`);
		const neonAuthUrl = execute(`neonctl auth url --project-id ${neonProjectId}`);
		appendToEnvFile('NEON_AUTH_URL', neonAuthUrl);
		console.log('Neon Auth enabled. URL written to .env.local');
		console.log('Google login works immediately with Neon shared dev credentials.\n');
	} catch {
		console.warn('Could not enable Neon Auth automatically.');
		console.warn('Enable it manually in the Neon dashboard and add NEON_AUTH_URL to .env.local\n');
	}

	// Phase 3: Optional Google OAuth production credentials
	const configureGoogle = await prompt('Configure production Google OAuth credentials? (y/N): ');

	if (configureGoogle.toLowerCase() === 'y') {
		console.log('\nOpen Google Cloud Console: https://console.cloud.google.com/apis/credentials');
		console.log('Create OAuth 2.0 Client ID with redirect URI:');
		console.log('  https://your-app.railway.app/api/auth/callback/google\n');

		const googleClientId = await prompt('GOOGLE_CLIENT_ID: ');
		const googleClientSecret = await prompt('GOOGLE_CLIENT_SECRET: ');

		if (googleClientId && googleClientSecret) {
			appendToEnvFile('GOOGLE_CLIENT_ID', googleClientId);
			appendToEnvFile('GOOGLE_CLIENT_SECRET', googleClientSecret);
			console.log('Google OAuth credentials written to .env.local\n');
		}
	}

	// Set PUBLIC_APP_URL
	appendToEnvFile('PUBLIC_APP_URL', 'http://localhost:3000');

	// Phase 4: Railway setup
	const configureRailway = await prompt('Configure Railway deployment? (y/N): ');

	if (configureRailway.toLowerCase() === 'y') {
		console.log('\nInitializing Railway project...');
		try {
			execute('railway init -y', { stdio: 'inherit' });

			// Set environment variables on Railway
			const envContent = readFileSync(envFilePath, 'utf-8');
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
			console.log('Railway environment variables configured.\n');
		} catch {
			console.warn('Railway setup failed. Configure manually with: railway init\n');
		}
	}

	// Phase 5: GitHub secrets
	const configureGithub = await prompt('Set GitHub secrets for CI/CD? (y/N): ');

	if (configureGithub.toLowerCase() === 'y') {
		try {
			execute(`gh secret set NEON_PROJECT_ID --body "${neonProjectId}"`);
			execute(`gh secret set DATABASE_URL --body "${connectionString}"`);
			execute('gh secret set SKIP_ENV_VALIDATION --body "true"');
			console.log('GitHub secrets configured.\n');
		} catch {
			console.warn('Failed to set GitHub secrets. Make sure gh is authenticated.\n');
		}
	}

	// Phase 6: Run initial migration
	console.log('Running initial migration...');
	try {
		execute('bun scripts/migrate.ts', { stdio: 'inherit' });
	} catch {
		console.warn('Migration failed. Run manually: bun scripts/migrate.ts\n');
	}

	// Summary
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

main();
