import { describe, expect, it } from 'bun:test';
import type { Component } from 'svelte';
import { render } from 'svelte/server';
import PrivacyPolicyPage from '@web/views/privacy-policy-page.svelte';
import SupportPage from '@web/views/support-page.svelte';
import TermsOfServicePage from '@web/views/terms-of-service-page.svelte';

/**
 * DOCS-001: `/privacy`, `/terms`, and `/support` are linked from both
 * authorization server metadata (RFC 8414) and protected resource metadata
 * (RFC 9728), so a connecting client or a reviewing host can reach them
 * without an out-of-band link. That makes their content a production
 * artifact, not decoration.
 *
 * These pages are served under `script-src 'none'` with no client bundle, so
 * every render is also checked for the two invariants the document shell
 * depends on: no `<head>` content (the shell builds the head itself) and no
 * `<script>` element at all.
 */
type LegalPage = Component<{ supportContactEmail: string | undefined }>;

const pages: Array<{ name: string; component: LegalPage }> = [
	{ name: 'PrivacyPolicyPage', component: PrivacyPolicyPage as LegalPage },
	{ name: 'TermsOfServicePage', component: TermsOfServicePage as LegalPage },
	{ name: 'SupportPage', component: SupportPage as LegalPage },
];

function renderPage(component: LegalPage, supportContactEmail: string | undefined): string {
	const output = render(component, { props: { supportContactEmail } });
	expect(output.head).toBe('');
	expect(output.body).not.toContain('<script');
	return output.body;
}

for (const { name, component } of pages) {
	describe(name, () => {
		it('renders its heading and a link back to home', () => {
			const markup = renderPage(component, 'support@example.com');
			expect(markup).toContain('<h1>');
			expect(markup).toContain('href="/"');
		});

		it('renders the configured support contact as a mailto link', () => {
			const markup = renderPage(component, 'support@example.com');
			expect(markup).toContain('mailto:support@example.com');
			expect(markup).toContain('support@example.com');
		});

		/**
		 * `SUPPORT_CONTACT_EMAIL` is optional and unset by default, so an
		 * operator who has not configured it must see an honest "not configured"
		 * notice naming the variable -- never a broken `mailto:` or a silently
		 * empty contact section.
		 */
		it('names the environment variable when no support contact is configured', () => {
			const markup = renderPage(component, undefined);
			expect(markup).toContain('SUPPORT_CONTACT_EMAIL');
			expect(markup).not.toContain('mailto:');
		});

		it('escapes a support address rather than emitting markup', () => {
			const markup = renderPage(component, '"><script>alert(1)</script>');
			expect(markup).not.toContain('<script>alert(1)');
		});
	});
}

describe('PrivacyPolicyPage content', () => {
	it('names every subprocessor this deployment actually depends on', () => {
		const markup = renderPage(PrivacyPolicyPage as LegalPage, 'support@example.com');
		for (const subprocessor of ['Neon', 'Redis', 'Railway', 'Google']) {
			expect(markup).toContain(subprocessor);
		}
	});

	it('states that credentials are stored only as hashes', () => {
		const markup = renderPage(PrivacyPolicyPage as LegalPage, 'support@example.com');
		expect(markup).toContain('SHA-256');
	});

	it('documents retention and deletion', () => {
		const markup = renderPage(PrivacyPolicyPage as LegalPage, 'support@example.com');
		expect(markup).toContain('Retention and deletion');
	});
});

describe('TermsOfServicePage content', () => {
	it('documents acceptable use and termination', () => {
		const markup = renderPage(TermsOfServicePage as LegalPage, 'support@example.com');
		expect(markup).toContain('Acceptable use');
		expect(markup).toContain('Termination');
	});
});

describe('SupportPage content', () => {
	it('explains how to revoke a connector and report a security issue', () => {
		const markup = renderPage(SupportPage as LegalPage, 'support@example.com');
		expect(markup).toContain('Removing a connector');
		expect(markup).toContain('Reporting a security issue');
	});
});
