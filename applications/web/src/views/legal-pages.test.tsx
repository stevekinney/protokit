import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyPolicyPage, SupportPage, TermsOfServicePage } from '@web/views/legal-pages';

describe('PrivacyPolicyPage', () => {
	it('renders the page heading', () => {
		const markup = renderToStaticMarkup(
			<PrivacyPolicyPage supportContactEmail="support@example.com" />,
		);
		expect(markup).toContain('Privacy Policy');
	});

	it('describes what data this server collects', () => {
		const markup = renderToStaticMarkup(
			<PrivacyPolicyPage supportContactEmail="support@example.com" />,
		);
		expect(markup).toContain('Account identity');
		expect(markup).toContain('Session and OAuth credentials');
	});

	it('links to the configured support contact email', () => {
		const markup = renderToStaticMarkup(
			<PrivacyPolicyPage supportContactEmail="support@example.com" />,
		);
		expect(markup).toContain('href="mailto:support@example.com"');
		expect(markup).toContain('support@example.com');
	});

	it('shows an operator warning when no support contact email is configured', () => {
		const markup = renderToStaticMarkup(<PrivacyPolicyPage supportContactEmail={undefined} />);
		expect(markup).toContain('has not configured a support contact');
		expect(markup).toContain('SUPPORT_CONTACT_EMAIL');
		expect(markup).not.toContain('mailto:');
	});

	it('links back to home', () => {
		const markup = renderToStaticMarkup(
			<PrivacyPolicyPage supportContactEmail="support@example.com" />,
		);
		expect(markup).toContain('href="/"');
	});
});

describe('TermsOfServicePage', () => {
	it('renders the page heading', () => {
		const markup = renderToStaticMarkup(
			<TermsOfServicePage supportContactEmail="support@example.com" />,
		);
		expect(markup).toContain('Terms of Service');
	});

	it('describes acceptable use', () => {
		const markup = renderToStaticMarkup(
			<TermsOfServicePage supportContactEmail="support@example.com" />,
		);
		expect(markup).toContain('Acceptable use');
		expect(markup).toContain('Do not attempt to bypass');
	});

	it('links to the configured support contact email', () => {
		const markup = renderToStaticMarkup(
			<TermsOfServicePage supportContactEmail="support@example.com" />,
		);
		expect(markup).toContain('href="mailto:support@example.com"');
	});

	it('shows an operator warning when no support contact email is configured', () => {
		const markup = renderToStaticMarkup(<TermsOfServicePage supportContactEmail={undefined} />);
		expect(markup).toContain('has not configured a support contact');
		expect(markup).not.toContain('mailto:');
	});
});

describe('SupportPage', () => {
	it('renders the page heading', () => {
		const markup = renderToStaticMarkup(<SupportPage supportContactEmail="support@example.com" />);
		expect(markup).toContain('Support');
	});

	it('describes removing a connector', () => {
		const markup = renderToStaticMarkup(<SupportPage supportContactEmail="support@example.com" />);
		expect(markup).toContain('Removing a connector');
		expect(markup).toContain('Reporting a security issue');
	});

	it('links to the configured support contact email', () => {
		const markup = renderToStaticMarkup(<SupportPage supportContactEmail="support@example.com" />);
		expect(markup).toContain('href="mailto:support@example.com"');
	});

	it('shows an operator warning when no support contact email is configured', () => {
		const markup = renderToStaticMarkup(<SupportPage supportContactEmail={undefined} />);
		expect(markup).toContain('has not configured a support contact');
		expect(markup).not.toContain('mailto:');
	});

	it('never renders placeholder or lorem-ipsum content', () => {
		const markup = renderToStaticMarkup(<SupportPage supportContactEmail="support@example.com" />);
		expect(markup.toLowerCase()).not.toContain('lorem ipsum');
		expect(markup.toLowerCase()).not.toContain('todo');
		expect(markup.toLowerCase()).not.toContain('placeholder');
	});
});
