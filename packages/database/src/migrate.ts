import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { join } from 'node:path';
import { environment } from './env.js';
import { applyLocalProxyFetchEndpoint } from './local-proxy.js';

/**
 * Applies every pending migration in `drizzle/` to the configured database.
 * Lives here — not in the root `scripts/` directory — because it is the only
 * place that already owns `@neondatabase/serverless` and `drizzle-orm` as
 * real dependencies; a root-level script importing them directly cannot
 * resolve them under Bun's isolated installs.
 */
export async function runMigrations(): Promise<void> {
	const databaseUrl = environment.databaseUrlUnpooled || environment.databaseUrl;

	applyLocalProxyFetchEndpoint(environment.databaseLocalProxyUrl);

	const sql = neon(databaseUrl);
	const database = drizzle(sql);

	await migrate(database, {
		migrationsFolder: join(import.meta.dirname, '..', 'drizzle'),
	});
}
