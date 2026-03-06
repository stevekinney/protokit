import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	schemaFilter: ['public'],
	dbCredentials: {
		url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
	},
});
