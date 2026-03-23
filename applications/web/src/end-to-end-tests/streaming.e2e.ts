import { expect, test } from '@playwright/test';

test.describe('streaming SSR', () => {
	test('page response contains complete HTML document', async ({ page }) => {
		const response = await page.goto('/');
		expect(response).not.toBeNull();
		expect(response!.status()).toBe(200);

		const html = await response!.text();
		expect(html).toContain('<!doctype html>');
		expect(html).toContain('</html>');
		expect(html).toContain('id="application-root"');
	});

	test('page contains __SERVER_DATA__ script', async ({ page }) => {
		await page.goto('/');
		const serverDataScript = page.locator('#__SERVER_DATA__');
		await expect(serverDataScript).toBeAttached();

		const content = await serverDataScript.textContent();
		expect(content).not.toBeNull();

		const data = JSON.parse(content!);
		expect(data.page).toBe('home');
	});
});
