import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomePage } from '@web/components/home-page';

describe('HomePage', () => {
	it('renders sign-in call-to-action when user is null', () => {
		const html = renderToStaticMarkup(<HomePage user={null} baseUrl="https://example.com" />);
		expect(html).toContain('Continue With Google');
		expect(html).toContain('/auth/google/start');
	});

	it('renders user email when authenticated', () => {
		const user = {
			id: 'user-1',
			email: 'test@example.com',
			name: 'Test User',
			image: null,
			role: 'user',
		};
		const html = renderToStaticMarkup(<HomePage user={user} baseUrl="https://example.com" />);
		expect(html).toContain('test@example.com');
		expect(html).toContain('Signed in as');
	});

	it('includes CopyButton next to MCP endpoint URL', () => {
		const html = renderToStaticMarkup(<HomePage user={null} baseUrl="https://example.com" />);
		expect(html).toContain('https://example.com/mcp');
		expect(html).toContain('Copy');
	});
});
