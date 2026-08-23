import { runMigrations } from '@template/database/migrate';

async function main() {
	console.log('Running migrations...');
	await runMigrations();
	console.log('Migrations completed successfully.');
}

main();
