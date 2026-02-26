import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { environment } from './env.js';
import * as schema from './schema.js';

const sql = neon(environment.DATABASE_URL);
export const database = drizzle(sql, { schema });

export { schema };
export type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
