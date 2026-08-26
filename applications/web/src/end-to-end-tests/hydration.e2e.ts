import { expect, test } from '@playwright/test';

test.describe('hydration', () => {
	test('page loads without JavaScript errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.goto('/');
		await page.waitForLoadState('networkidle');

		expect(errors).toHaveLength(0);
	});

	test('client bundle is requested', async ({ page, request }) => {
		// The bundle's filename is content-hashed by `src/build.ts`, so the name
		// is read from the asset manifest rather than hardcoded. Hardcoding
		// `/assets/client.js` only ever matched the stable names the dev server
		// writes, and failed against any real build.
		const manifest = await (await request.get('/assets/manifest.json')).json();
		const clientBundlePath: string = manifest.clientBundlePath;
		expect(clientBundlePath).toMatch(/^\/assets\/client.*\.js$/);

		const clientBundleRequested = page.waitForResponse(
			(response) => response.url().endsWith(clientBundlePath) && response.status() === 200,
		);

		await page.goto('/');
		const response = await clientBundleRequested;

		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('javascript');
	});

	test('no hydration mismatch warnings in console', async ({ page }) => {
		const warnings: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'warning' || message.type() === 'error') {
				warnings.push(message.text());
			}
		});

		await page.goto('/');
		await page.waitForLoadState('networkidle');

		const hydrationWarnings = warnings.filter(
			(warning) =>
				warning.includes('hydrat') ||
				warning.includes('mismatch') ||
				warning.includes('did not match'),
		);
		expect(hydrationWarnings).toHaveLength(0);
	});

	test('page has expected server-rendered content', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('h1')).toContainText('MCP OAuth Server');
		await expect(page.locator('text=Continue With Google')).toBeVisible();
	});
});
