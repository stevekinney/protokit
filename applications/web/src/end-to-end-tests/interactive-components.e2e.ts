import { expect, test } from '@playwright/test';

test.describe('interactive components', () => {
	test('CopyButton renders and is clickable', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		const copyButton = page.locator('button', { hasText: 'Copy' });
		await expect(copyButton).toBeVisible();
		await copyButton.click();
	});

	test('CopyButton shows feedback after click', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		const copyButton = page.locator('button', { hasText: 'Copy' });
		await copyButton.click();

		await expect(page.locator('button', { hasText: 'Copied!' })).toBeVisible({ timeout: 3000 });
	});
});
