import { expect, test } from '@playwright/test';

test.describe('hydration', () => {
	test('page loads without JavaScript errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.goto('/');
		await page.waitForLoadState('networkidle');

		expect(errors).toHaveLength(0);
	});

	test('client bundle is requested', async ({ page }) => {
		const clientBundleRequested = page.waitForResponse(
			(response) => response.url().includes('/assets/client.js') && response.status() === 200,
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
