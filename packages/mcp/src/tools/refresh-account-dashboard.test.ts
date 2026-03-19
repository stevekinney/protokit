import { describe, it, expect } from 'bun:test';
import { refreshAccountDashboardTool } from './refresh-account-dashboard';

describe('refreshAccountDashboardTool', () => {
	it('has the expected name', () => {
		expect(refreshAccountDashboardTool.name).toBe('refresh_account_dashboard');
	});

	it('has a description', () => {
		expect(refreshAccountDashboardTool.description).toBeTruthy();
	});

	it('has an inputSchema', () => {
		expect(refreshAccountDashboardTool.inputSchema).toBeDefined();
	});

	it('has a handler function', () => {
		expect(typeof refreshAccountDashboardTool.handler).toBe('function');
	});

	it('returns content with JSON-serialized state', async () => {
		const result = await refreshAccountDashboardTool.handler(
			{ section: 'overview' },
			{ userId: 'test-user' },
		);

		expect(result.content).toHaveLength(1);
		expect(result.content[0].type).toBe('text');

		const parsed = JSON.parse(result.content[0].text);
		expect(parsed.userId).toBe('test-user');
		expect(parsed.section).toBe('overview');
	});

	it('returns structuredContent matching the requested section', async () => {
		const result = await refreshAccountDashboardTool.handler(
			{ section: 'security' },
			{ userId: 'test-user' },
		);

		expect(result.structuredContent).toMatchObject({
			userId: 'test-user',
			section: 'security',
		});
		expect(result.structuredContent.generatedAt).toBeTruthy();
	});

	it('returns fresh generatedAt on each call', async () => {
		const first = await refreshAccountDashboardTool.handler(
			{ section: 'usage' },
			{ userId: 'test-user' },
		);
		const second = await refreshAccountDashboardTool.handler(
			{ section: 'usage' },
			{ userId: 'test-user' },
		);

		expect(first.structuredContent.generatedAt).toBeTruthy();
		expect(second.structuredContent.generatedAt).toBeTruthy();
	});
});
