import { describe, it, expect } from 'bun:test';
import { renderAccountDashboardTool } from './render-account-dashboard';

describe('renderAccountDashboardTool', () => {
	it('has the expected name', () => {
		expect(renderAccountDashboardTool.name).toBe('render_account_dashboard');
	});

	it('has a description', () => {
		expect(renderAccountDashboardTool.description).toBeTruthy();
	});

	it('has an inputSchema', () => {
		expect(renderAccountDashboardTool.inputSchema).toBeDefined();
	});

	it('has a handler function', () => {
		expect(typeof renderAccountDashboardTool.handler).toBe('function');
	});

	it('returns content with the requested section', async () => {
		const result = await renderAccountDashboardTool.handler(
			{ section: 'security' },
			{ userId: 'test-user' },
		);

		expect(result.content).toHaveLength(1);
		expect(result.content[0].type).toBe('text');
		expect(result.content[0].text).toContain('security');
	});

	it('returns structuredContent with userId and section', async () => {
		const result = await renderAccountDashboardTool.handler(
			{ section: 'usage' },
			{ userId: 'test-user' },
		);

		expect(result.structuredContent).toMatchObject({
			userId: 'test-user',
			section: 'usage',
		});
		expect(result.structuredContent.generatedAt).toBeTruthy();
	});

	it('returns spec-compliant _meta with ui.resourceUri', async () => {
		const result = await renderAccountDashboardTool.handler(
			{ section: 'overview' },
			{ userId: 'test-user' },
		);

		expect(result._meta).toEqual({
			ui: {
				resourceUri: 'ui://account-dashboard',
			},
		});
	});
});
