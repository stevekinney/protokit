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

	/**
	 * DATA-001 / S-18: "Add a user-facing connector and consent inventory
	 * with revoke-all and per-client revocation."
	 */
	it('omits the connections section when there are no connections', () => {
		const user = {
			id: 'user-1',
			email: 'test@example.com',
			name: 'Test User',
			image: null,
			role: 'user',
		};
		const html = renderToStaticMarkup(
			<HomePage user={user} baseUrl="https://example.com" connections={[]} />,
		);
		expect(html).not.toContain('Connected Applications');
	});

	it('renders one entry per connection with a per-client revoke form and a revoke-all form', () => {
		const user = {
			id: 'user-1',
			email: 'test@example.com',
			name: 'Test User',
			image: null,
			role: 'user',
		};
		const html = renderToStaticMarkup(
			<HomePage
				user={user}
				baseUrl="https://example.com"
				connections={[
					{
						clientId: 'client-1',
						clientName: 'Claude',
						earliestExpiresAt: new Date().toISOString(),
					},
				]}
				connectionsCsrfToken="csrf-token-value"
			/>,
		);
		expect(html).toContain('Connected Applications');
		expect(html).toContain('Claude');
		expect(html).toContain('/account/connections/revoke-all');
		expect(html).toContain('/account/connections/revoke');
		expect(html).toContain('client-1');
		expect(html).toContain('csrf-token-value');
	});

	it('never renders the connections section when signed out, even if connections were somehow passed', () => {
		const html = renderToStaticMarkup(
			<HomePage
				user={null}
				baseUrl="https://example.com"
				connections={[
					{
						clientId: 'client-1',
						clientName: 'Claude',
						earliestExpiresAt: new Date().toISOString(),
					},
				]}
			/>,
		);
		expect(html).not.toContain('Connected Applications');
	});
});
