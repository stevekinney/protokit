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
			clientId: 'client-123',
			redirectUri: 'https://example.com/callback',
			codeChallenge: 'challenge-abc',
			codeChallengeMethod: 'S256',
			state: 'state-xyz',
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

		it('renders the approve form with correct action', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage {...formInput} />);
			expect(markup).toContain('action="/oauth/authorize/approve"');
		});

		it('renders the deny form with correct action', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage {...formInput} />);
			expect(markup).toContain('action="/oauth/authorize/deny"');
		});

		it('includes hidden inputs with correct values', () => {
			const markup = renderToStaticMarkup(<OauthAuthorizePage {...formInput} />);
			expect(markup).toContain('value="client-123"');
			expect(markup).toContain('value="https://example.com/callback"');
			expect(markup).toContain('value="challenge-abc"');
			expect(markup).toContain('value="state-xyz"');
		});
	});
});
