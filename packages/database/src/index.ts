import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { environment } from './env.js';
import * as schema from './schema.js';

let instance: NeonHttpDatabase<typeof schema> | undefined;

export function getDatabase(): NeonHttpDatabase<typeof schema> {
	if (!instance) {
		const sql = neon(environment.DATABASE_URL);
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
