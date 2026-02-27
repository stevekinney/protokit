import { existsSync } from 'node:fs';

import {
	commandExists,
	execute,
	confirm,
	prompt,
	getEnvironmentValue,
	deleteEnvironmentFile,
	ENVIRONMENT_FILE_PATH,
	MANAGED_GITHUB_SECRETS,
} from './utilities.ts';

async function teardownGithubSecrets() {
	console.log('\n--- GitHub Secrets ---\n');

	if (!commandExists('gh')) {
		console.log('gh is not installed. Nothing to do.');
		return;
	}

	let secretList: string;
	try {
		secretList = execute('gh secret list');
	} catch {
		console.log('Could not list GitHub secrets (not authenticated or no repo). Nothing to do.');
		return;
	}

	const existing = MANAGED_GITHUB_SECRETS.filter((secret) => secretList.includes(secret));

	if (existing.length === 0) {
		console.log('No managed GitHub secrets found. Nothing to do.');
		return;
	}

	console.log(`Found ${existing.length} managed secret(s): ${existing.join(', ')}`);
	const shouldDelete = await confirm('Delete these GitHub secrets? (y/N): ');

	if (!shouldDelete) {
		console.log('Skipped.');
		return;
	}

	for (const secret of existing) {
		try {
			execute(`gh secret delete ${secret}`);
			console.log(`  Deleted: ${secret}`);
		} catch {
			console.warn(`  Failed to delete: ${secret}`);
		}
	}
}

async function teardownRailway() {
	console.log('\n--- Railway ---\n');

	if (!commandExists('railway')) {
		console.log('railway is not installed. Nothing to do.');
		return;
	}

	try {
		execute('railway status');
	} catch {
		console.log('No Railway project linked. Nothing to do.');
		return;
	}

	const shouldUnlink = await confirm('Unlink Railway project? (y/N): ');

	if (!shouldUnlink) {
		console.log('Skipped.');
		return;
	}

	try {
		execute('railway unlink');
		console.log('Railway project unlinked.');
	} catch {
		console.warn('Failed to unlink Railway project.');
	}
}

async function teardownEnvironmentFile() {
	console.log('\n--- Environment File ---\n');

	if (!existsSync(ENVIRONMENT_FILE_PATH)) {
		console.log('.env.local does not exist. Nothing to do.');
		return;
	}

	const shouldDelete = await confirm('Delete .env.local? (y/N): ');

	if (!shouldDelete) {
		console.log('Skipped.');
		return;
	}

	deleteEnvironmentFile();
	console.log('.env.local deleted.');
}

async function teardownNeon() {
	console.log('\n--- Neon ---\n');

	if (!commandExists('neonctl')) {
		console.log('neonctl is not installed. Nothing to do.');
		return;
	}

	let projects: Array<{ id: string; name: string }>;
	try {
		const output = execute('neonctl projects list --output json');
		const parsed = JSON.parse(output);
		projects = Array.isArray(parsed) ? parsed : parsed.projects || [];
	} catch {
		console.log('Could not list Neon projects (not authenticated). Nothing to do.');
		return;
	}

	if (projects.length === 0) {
		console.log('No Neon projects found. Nothing to do.');
		return;
	}

	// Try to identify the project configured in .env.local via DATABASE_URL
	const configuredDatabaseUrl = getEnvironmentValue('DATABASE_URL');
	let defaultProject: (typeof projects)[number] | undefined;

	if (configuredDatabaseUrl) {
		defaultProject = projects.find((project) => configuredDatabaseUrl.includes(project.id));
	}

	let project: (typeof projects)[number];

	if (defaultProject) {
		console.log(`Found project from .env.local: ${defaultProject.name} (${defaultProject.id})`);
		const useDefault = await confirm('Delete this project? (y/N): ');

		if (!useDefault) {
			console.log('Skipped.');
			return;
		}

		project = defaultProject;
	} else {
		console.log('Neon projects:');
		for (let i = 0; i < projects.length; i++) {
			console.log(`  ${i + 1}. ${projects[i].name} (${projects[i].id})`);
		}

		const selection = await prompt('\nEnter number to delete (or press Enter to skip): ');

		if (!selection) {
			console.log('Skipped.');
			return;
		}

		const index = parseInt(selection, 10) - 1;

		if (isNaN(index) || index < 0 || index >= projects.length) {
			console.log('Invalid selection. Skipped.');
			return;
		}

		project = projects[index];
	}

	console.log(
		`\n\x1b[31mWARNING: This will permanently delete Neon project "${project.name}" (${project.id}).\x1b[0m`,
	);
	console.log('\x1b[31mAll databases and data in this project will be lost.\x1b[0m');

	const typedName = await prompt(`Type the project name "${project.name}" to confirm: `);

	if (typedName !== project.name) {
		console.log('Name does not match. Skipped.');
		return;
	}

	try {
		execute(`neonctl projects delete ${project.id}`);
		console.log(`Neon project "${project.name}" deleted.`);
	} catch {
		console.warn('Failed to delete Neon project.');
	}
}

async function runFullTeardown() {
	console.log('\n=== Teardown ===\n');
	console.log('This will walk through removing configured services.');
	console.log('Each step requires explicit confirmation.\n');

	await teardownGithubSecrets();
	await teardownRailway();
	await teardownEnvironmentFile();
	await teardownNeon();

	console.log('\n=== Teardown Complete ===\n');
}

const subcommand = process.argv[2];

const phases: Record<string, () => Promise<void>> = {
	github: teardownGithubSecrets,
	railway: teardownRailway,
	environment: teardownEnvironmentFile,
	neon: teardownNeon,
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
	await runFullTeardown();
}
