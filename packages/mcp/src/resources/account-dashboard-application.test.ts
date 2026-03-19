import { describe, it, expect } from 'bun:test';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { accountDashboardApplicationResource } from './account-dashboard-application';

describe('accountDashboardApplicationResource', () => {
	it('has the expected name', () => {
		expect(accountDashboardApplicationResource.name).toBe('account_dashboard_application');
	});

	it('has the expected uri', () => {
		expect(accountDashboardApplicationResource.uri).toBe('ui://account-dashboard');
	});

	it('has a description', () => {
		expect(accountDashboardApplicationResource.description).toBeTruthy();
	});

	it('uses RESOURCE_MIME_TYPE from ext-apps', () => {
		expect(accountDashboardApplicationResource.mimeType).toBe(RESOURCE_MIME_TYPE);
		expect(accountDashboardApplicationResource.mimeType).toBe('text/html;profile=mcp-app');
	});

	it('has a handler function', () => {
		expect(typeof accountDashboardApplicationResource.handler).toBe('function');
	});

	it('returns HTML content with the correct mimeType', async () => {
		const uri = new URL('ui://account-dashboard');
		const result = await accountDashboardApplicationResource.handler(uri, {
			userId: 'test-user',
		});

		expect(result.contents).toHaveLength(1);
		expect(result.contents[0].mimeType).toBe(RESOURCE_MIME_TYPE);
		expect(result.contents[0].uri).toBe('ui://account-dashboard');
	});

	it('returns HTML containing a root mount point and script', async () => {
		const uri = new URL('ui://account-dashboard');
		const result = await accountDashboardApplicationResource.handler(uri, {
			userId: 'test-user',
		});

		const html = result.contents[0].text;
		expect(html).toContain('<!doctype html>');
		expect(html).toContain('<div id="root"></div>');
		expect(html).toContain('<script type="module">');
	});

	it('includes CSP metadata allowing inline scripts and styles', async () => {
		const uri = new URL('ui://account-dashboard');
		const result = await accountDashboardApplicationResource.handler(uri, {
			userId: 'test-user',
		});

		const meta = result.contents[0]._meta;
		expect(meta).toBeDefined();

		const uiMeta = meta!['io.modelcontextprotocol/ui'] as Record<string, unknown>;
		expect(uiMeta).toBeDefined();

		const csp = uiMeta.csp as Record<string, string[]>;
		expect(csp['default-src']).toEqual(["'none'"]);
		expect(csp['script-src']).toEqual(["'unsafe-inline'"]);
		expect(csp['style-src']).toEqual(["'unsafe-inline'"]);
	});
});
