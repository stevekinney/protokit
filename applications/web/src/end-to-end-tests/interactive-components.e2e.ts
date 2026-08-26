import { expect, test } from '@playwright/test';

test.describe('interactive components', () => {
	test('CopyButton renders and is clickable', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		const copyButton = page.locator('.cinder-copy-button');
		await expect(copyButton).toBeVisible();
		await copyButton.click();
	});

	test('CopyButton shows feedback after click', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		const copyButton = page.locator('.cinder-copy-button');
		await copyButton.click();

		// Asserted against the component's own state attribute rather than its
		// visible label: the accessible name stays "Copy to clipboard" through
		// the confirmation window by design, and the visible text is
		// presentational.
		await expect(copyButton).toHaveAttribute('data-cinder-copied', 'true', { timeout: 3000 });
	});
});
