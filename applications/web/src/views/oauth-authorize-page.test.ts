import { describe, expect, it } from 'bun:test';
import { render } from 'svelte/server';
import OauthAuthorizePage from '@web/views/oauth-authorize-page.svelte';
import type { OAuthAuthorizePageInput } from '@web/views/oauth-authorize-page.types';

/**
 * This page is served under `script-src 'none'`, so alongside the usual
 * assertions every render is checked for two things: that it emits no `<head>`
 * content (the document shell cannot deliver it) and that it contains no
 * `<script>` element at all.
 */
function renderPage(props: OAuthAuthorizePageInput): string {
	const output = render(OauthAuthorizePage, { props });
	expect(output.head).toBe('');
	expect(output.body).not.toContain('<script');
	return output.body;
}

describe('OauthAuthorizePage', () => {
	describe('error mode', () => {
		it('renders the error heading', () => {
			const markup = renderPage({ mode: 'error', error: 'Something went wrong' });
			expect(markup).toContain('Authorization Error');
		});

		it('renders the error message', () => {
			const markup = renderPage({ mode: 'error', error: 'Missing required fields.' });
			expect(markup).toContain('Missing required fields.');
		});

		it('includes a link back to home', () => {
			const markup = renderPage({ mode: 'error', error: 'Bad request' });
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
			scopes: [{ scope: 'profile:read', description: 'Read your profile information.' }],
		};

		it('renders the client name', () => {
			const markup = renderPage(formInput);
			expect(markup).toContain('Authorize Test App');
		});

		it('renders the user email', () => {
			const markup = renderPage(formInput);
			expect(markup).toContain('alice@example.com');
		});

		it('renders the redirect host', () => {
			const markup = renderPage(formInput);
			expect(markup).toContain('example.com');
		});

		it('renders the approve form with correct action', () => {
			const markup = renderPage(formInput);
			expect(markup).toContain('action="/oauth/authorize/approve"');
		});

		it('renders the deny form with correct action', () => {
			const markup = renderPage(formInput);
			expect(markup).toContain('action="/oauth/authorize/deny"');
		});

		it('carries only the transaction id and CSRF token as hidden inputs, never the client or redirect metadata', () => {
			const markup = renderPage(formInput);
			expect(markup).toContain('value="transaction-id-abc"');
			expect(markup).toContain('value="csrf-token-xyz"');
			expect(markup).not.toContain('name="client_id"');
			expect(markup).not.toContain('name="redirect_uri"');
			expect(markup).not.toContain('name="code_challenge"');
			expect(markup).not.toContain('name="state"');
		});

		it('renders the same transaction id and CSRF token in both forms', () => {
			const markup = renderPage(formInput);
			const transactionIdCount = markup.split('value="transaction-id-abc"').length - 1;
			const csrfTokenCount = markup.split('value="csrf-token-xyz"').length - 1;
			expect(transactionIdCount).toBe(2);
			expect(csrfTokenCount).toBe(2);
		});

		it('displays every requested scope description exactly once', () => {
			const markup = renderPage({
				...formInput,
				scopes: [
					{ scope: 'profile:read', description: 'Read your profile information.' },
					{ scope: 'prompts:read', description: 'Use this server’s prompt templates.' },
				],
			});
			expect(markup).toContain('Read your profile information.');
			expect(markup).toContain('Use this server’s prompt templates.');
		});

		it('never displays a scope that was not passed in', () => {
			const markup = renderPage({
				...formInput,
				scopes: [{ scope: 'profile:read', description: 'Read your profile information.' }],
			});
			expect(markup).not.toContain('audit:read');
			expect(markup).not.toContain('prompts:read');
		});
	});
});
