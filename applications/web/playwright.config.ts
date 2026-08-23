import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'src/end-to-end-tests',
	testMatch: '*.e2e.ts',
	timeout: 15_000,
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: 'http://localhost:3456',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		command: 'bun run src/server.ts',
		port: 3456,
		env: {
			NODE_ENV: 'test',
			PORT: '3456',
			DATABASE_URL: 'postgresql://protokit:protokit@db.localtest.me:5432/protokit_test',
			DATABASE_LOCAL_PROXY_URL: 'http://db.localtest.me:4444/sql',
			GOOGLE_CLIENT_ID: 'test-google-client-id',
			GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
			SESSION_SIGNING_SECRET: 'development-session-secret-with-at-least-32-characters',
			REDIS_URL: 'redis://localhost:6379',
			MCP_ALLOWED_ORIGINS: 'http://localhost:3456',
		},
		reuseExistingServer: !process.env.CI,
	},
});
