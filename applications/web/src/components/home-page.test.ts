import { describe, expect, it } from 'bun:test';
import { render } from 'svelte/server';
import HomePage from '@web/components/home-page.svelte';
import type { HomePageProps } from '@web/components/home-page.types';

const user = { email: 'test@example.com', name: 'Test User', image: null };

function renderHomePage(props: HomePageProps): string {
	const output = render(HomePage, { props });
	// The document shell builds `<head>` from DocumentMetadata and, for
	// streaming responses, flushes it before the body renders -- so a
	// component that emitted head content would have it silently dropped.
	// `createStaticHtmlResponse`/`createStreamingHtmlResponse` enforce this at
	// runtime; asserting it here points at the component that broke it.
	expect(output.head).toBe('');
	return output.body;
}

describe('HomePage', () => {
	it('renders sign-in call-to-action when user is null', () => {
		const html = renderHomePage({ user: null, baseUrl: 'https://example.com' });
		expect(html).toContain('Continue With Google');
		expect(html).toContain('/auth/google/start');
	});

	it('renders user email when authenticated', () => {
		const html = renderHomePage({ user, baseUrl: 'https://example.com' });
		expect(html).toContain('test@example.com');
		expect(html).toContain('Signed in as');
	});

	/**
	 * Review round 4 / P2: a parameterless `/oauth/authorize` link always
	 * rendered that route's invalid-parameters error, since OAuth consent
	 * must be initiated by a client carrying `client_id`, `redirect_uri`,
	 * `response_type`, PKCE, and `resource` -- none of which this page has.
	 */
	it('never links to a parameterless /oauth/authorize for a signed-in user', () => {
		const html = renderHomePage({ user, baseUrl: 'https://example.com' });
		expect(html).not.toContain('href="/oauth/authorize"');
		expect(html).not.toContain('Review OAuth Request');
	});

	it('includes a copy control next to the MCP endpoint URL', () => {
		const html = renderHomePage({ user: null, baseUrl: 'https://example.com' });
		expect(html).toContain('https://example.com/mcp');
		expect(html).toContain('cinder-copy-button');
	});

	/**
	 * DATA-001 / S-18: "Add a user-facing connector and consent inventory
	 * with revoke-all and per-client revocation."
	 */
	it('omits the connections section when there are no connections', () => {
		const html = renderHomePage({ user, baseUrl: 'https://example.com', connections: [] });
		expect(html).not.toContain('Connected Applications');
	});

	it('renders one entry per connection with a per-client revoke form and a revoke-all form', () => {
		const html = renderHomePage({
			user,
			baseUrl: 'https://example.com',
			connections: [
				{
					clientId: 'client-1',
					clientName: 'Claude',
					earliestExpiresAt: new Date().toISOString(),
				},
			],
			connectionsCsrfToken: 'csrf-token-value',
		});
		expect(html).toContain('Connected Applications');
		expect(html).toContain('Claude');
		expect(html).toContain('/account/connections/revoke-all');
		expect(html).toContain('/account/connections/revoke');
		expect(html).toContain('client-1');
		expect(html).toContain('csrf-token-value');
	});

	it('never renders the connections section when signed out, even if connections were somehow passed', () => {
		const html = renderHomePage({
			user: null,
			baseUrl: 'https://example.com',
			connections: [
				{
					clientId: 'client-1',
					clientName: 'Claude',
					earliestExpiresAt: new Date().toISOString(),
				},
			],
		});
		expect(html).not.toContain('Connected Applications');
	});
});
