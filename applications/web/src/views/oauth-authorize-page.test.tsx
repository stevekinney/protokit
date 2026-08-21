import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { OauthAuthorizePage } from '@web/views/oauth-authorize-page';

describe('OauthAuthorizePage', () => {
	describe('error mode', () => {
		it('renders the error heading', () => {
			const markup = renderToStaticMarkup(
				<OauthAuthorizePage mode="error" error="Something went wrong" />,
			);
			expect(markup).toContain('Authorization Error');
		});

		it('renders the error message', () => {
			const markup = renderToStaticMarkup(
				<OauthAuthorizePage mode="error" error="Missing required fields." />,
			);
			expect(markup).toContain('Missing required fields.');
		});

		it('includes a link back to home', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage mode="error" error="Bad request" />);
			expect(markup).toContain('href="/"');
		});
	});

	describe('form mode', () => {
		const formInput = {
			mode: 'form' as const,
			clientName: 'Test App',
			redirectUri: 'https://example.com/callback',
			transactionId: 'transaction-id-abc',
			csrfToken: 'csrf-token-xyz',
			user: {
				id: 'user-1',
				email: 'alice@example.com',
				name: 'Alice',
				image: null,
				role: 'user',
			},
		};

		it('renders the client name', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage {...formInput} />);
			expect(markup).toContain('Authorize Test App');
		});

		it('renders the user email', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage {...formInput} />);
			expect(markup).toContain('alice@example.com');
		});

		it('renders the redirect host', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage {...formInput} />);
			expect(markup).toContain('example.com');
		});

		it('renders the approve form with correct action', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage {...formInput} />);
			expect(markup).toContain('action="/oauth/authorize/approve"');
		});

		it('renders the deny form with correct action', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage {...formInput} />);
			expect(markup).toContain('action="/oauth/authorize/deny"');
		});

		it('carries only the transaction id and CSRF token as hidden inputs, never the client or redirect metadata', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage {...formInput} />);
			expect(markup).toContain('value="transaction-id-abc"');
			expect(markup).toContain('value="csrf-token-xyz"');
			expect(markup).not.toContain('name="client_id"');
			expect(markup).not.toContain('name="redirect_uri"');
			expect(markup).not.toContain('name="code_challenge"');
			expect(markup).not.toContain('name="state"');
		});

		it('renders the same transaction id and CSRF token in both forms', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage {...formInput} />);
			const transactionIdCount = markup.split('value="transaction-id-abc"').length - 1;
			const csrfTokenCount = markup.split('value="csrf-token-xyz"').length - 1;
			expect(transactionIdCount).toBe(2);
			expect(csrfTokenCount).toBe(2);
		});
	});
});
