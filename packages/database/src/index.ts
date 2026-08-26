import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { environment } from './env.js';
import { applyLocalProxyFetchEndpoint } from './local-proxy.js';
import * as schema from './schema.js';

let instance: NeonHttpDatabase<typeof schema> | undefined;

function getDatabase(): NeonHttpDatabase<typeof schema> {
	if (!instance) {
		applyLocalProxyFetchEndpoint(environment.databaseLocalProxyUrl);
		const sql = neon(environment.databaseUrl);
		instance = drizzle(sql, { schema });
	}
	return instance;
}

export const database = new Proxy({} as NeonHttpDatabase<typeof schema>, {
	get(_target, property, receiver) {
		return Reflect.get(getDatabase(), property, receiver);
	},
});

export { schema };
export { applyLocalProxyFetchEndpoint } from './local-proxy.js';
