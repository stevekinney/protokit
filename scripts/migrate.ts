import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { join } from 'node:path';

async function main() {
	const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

	if (!databaseUrl) {
		console.error('DATABASE_URL or DATABASE_URL_UNPOOLED must be set');
		process.exit(1);
	}

	const sql = neon(databaseUrl);
	const database = drizzle(sql);

	console.log('Running migrations...');

	await migrate(database, {
		migrationsFolder: join(import.meta.dirname, '..', 'packages', 'database', 'drizzle'),
	});

	console.log('Migrations completed successfully.');
}

main();
